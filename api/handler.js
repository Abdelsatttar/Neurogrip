import { neon } from "@neondatabase/serverless";
import { createHash, createPublicKey, randomBytes, randomUUID, scrypt, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const COOKIE_NAME = "neurogrip_session";
let sqlClient;
let schemaPromise;
let googleJwksCache = null;
let googleJwksExpiresAt = 0;

const workspaceMap = {
  patient: ["dashboard", "howToUse", "learning", "support", "profile", "settings"],
  doctor: ["overview", "patients", "reports", "support", "settings"],
  developer: ["overview", "diagnostics", "logs", "support", "settings"],
};

function db() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error("Database connection is not configured.");
  if (!sqlClient) sqlClient = neon(connectionString);
  return sqlClient;
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = db();
      const statements = [
        "CREATE TABLE IF NOT EXISTS ng_users (id text PRIMARY KEY, role text NOT NULL CHECK (role IN ('patient','doctor','developer')), name varchar(80) NOT NULL, email varchar(320) NOT NULL, password_salt text NOT NULL, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW())",
        "CREATE UNIQUE INDEX IF NOT EXISTS ng_users_email_lower_unique ON ng_users (lower(email))",
        "CREATE TABLE IF NOT EXISTS ng_sessions (token_hash char(64) PRIMARY KEY, user_id text NOT NULL REFERENCES ng_users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW())",
        "CREATE INDEX IF NOT EXISTS ng_sessions_user_id_idx ON ng_sessions (user_id)",
        "CREATE INDEX IF NOT EXISTS ng_sessions_expiry_idx ON ng_sessions (expires_at)",
        "CREATE TABLE IF NOT EXISTS ng_notifications (id text PRIMARY KEY, user_id text NOT NULL REFERENCES ng_users(id) ON DELETE CASCADE, type text NOT NULL, ticket_id text, subject varchar(100) NOT NULL DEFAULT '', actor_role text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT NOW(), read_at timestamptz)",
        "CREATE INDEX IF NOT EXISTS ng_notifications_user_created_idx ON ng_notifications (user_id, created_at DESC)",
        "CREATE TABLE IF NOT EXISTS ng_support_tickets (id text PRIMARY KEY, patient_id text NOT NULL REFERENCES ng_users(id), patient_name varchar(80) NOT NULL, category text NOT NULL CHECK (category IN ('device','training','other')), subject varchar(100) NOT NULL, description varchar(2000) NOT NULL, status text NOT NULL CHECK (status IN ('open','in_progress','resolved')), shared_with_developer boolean NOT NULL DEFAULT false, forwarded_to_developer boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW(), messages jsonb NOT NULL DEFAULT '[]'::jsonb)",
        "CREATE INDEX IF NOT EXISTS ng_support_tickets_patient_updated_idx ON ng_support_tickets (patient_id, updated_at DESC)",
        "CREATE INDEX IF NOT EXISTS ng_support_tickets_updated_idx ON ng_support_tickets (updated_at DESC)",
        "CREATE TABLE IF NOT EXISTS ng_auth_rate_limits (ip_hash char(64) PRIMARY KEY, window_started_at timestamptz NOT NULL DEFAULT NOW(), attempts integer NOT NULL DEFAULT 0)",
        "ALTER TABLE ng_users ADD COLUMN IF NOT EXISTS profile_phone varchar(30)",
        "ALTER TABLE ng_users ADD COLUMN IF NOT EXISTS preferred_hand varchar(8) NOT NULL DEFAULT 'right'",
        "ALTER TABLE ng_users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz",
        "ALTER TABLE ng_users ADD COLUMN IF NOT EXISTS google_sub text",
        "CREATE UNIQUE INDEX IF NOT EXISTS ng_users_google_sub_unique ON ng_users (google_sub) WHERE google_sub IS NOT NULL",
        "CREATE TABLE IF NOT EXISTS ng_password_reset_tokens (token_hash char(64) PRIMARY KEY, user_id text NOT NULL REFERENCES ng_users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW())",
        "CREATE INDEX IF NOT EXISTS ng_password_reset_user_idx ON ng_password_reset_tokens (user_id)",
        "CREATE INDEX IF NOT EXISTS ng_password_reset_expiry_idx ON ng_password_reset_tokens (expires_at)",
        "CREATE TABLE IF NOT EXISTS ng_google_oauth_states (state_hash char(64) PRIMARY KEY, nonce text NOT NULL, code_verifier text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW())",
      ];
      for (const statement of statements) await sql.query(statement, []);
    })();
  }
  try {
    await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

function sendJson(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  let suppliedBody;
  try { suppliedBody = req.body; } catch { throw new Error("Invalid JSON."); }
  if (suppliedBody && typeof suppliedBody === "object" && !Buffer.isBuffer(suppliedBody)) return suppliedBody;
  let raw = typeof suppliedBody === "string" ? suppliedBody : Buffer.isBuffer(suppliedBody) ? suppliedBody.toString("utf8") : "";
  if (!raw && typeof req[Symbol.asyncIterator] === "function") {
    for await (const chunk of req) {
      raw += chunk.toString();
      if (raw.length > 1024 * 1024) throw new Error("Request body is too large.");
    }
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON.");
  }
}

function getCookie(req, key) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === key) {
      try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

function cookieHeader(token, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return COOKIE_NAME + "=" + encodeURIComponent(token) + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + maxAge + secure;
}

function publicUser(user) {
  return {
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    phone: user.profile_phone || "",
    preferredHand: user.preferred_hand || "right",
  };
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function secureEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function makePasswordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return { salt, hash: Buffer.from(derived).toString("hex") };
}

async function passwordMatches(password, record) {
  if (!record || typeof record.salt !== "string" || typeof record.hash !== "string") return false;
  const candidate = Buffer.from(await scryptAsync(password, record.salt, 64));
  const expected = Buffer.from(record.hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function appBaseUrl(req) {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = String((Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.headers.host || "localhost").split(",")[0].trim();
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = String((Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) || "https").split(",")[0].trim();
  return (protocol === "http" ? "http://" : "https://") + host;
}

function sendRedirect(res, location, cookies = []) {
  res.statusCode = 302;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Location", location);
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.end();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function emailDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function sendAuthEmail({ to, subject, html, text }) {
  if (!emailDeliveryConfigured()) {
    const error = new Error("Password recovery email is not configured.");
    error.code = "email_not_configured";
    throw error;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject,
      html,
      text,
    }),
  });
  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    console.error("[neurogrip-email] Delivery failed", response.status, responseText.slice(0, 240));
    const error = new Error("The email provider rejected the message.");
    error.code = "email_delivery_failed";
    throw error;
  }
}

function googleRedirectUri(req) {
  return process.env.GOOGLE_REDIRECT_URI || appBaseUrl(req) + "/api/auth/google/callback";
}

async function googleSigningKeys() {
  if (googleJwksCache && Date.now() < googleJwksExpiresAt) return googleJwksCache;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Could not retrieve Google's signing keys.");
  const data = await response.json();
  if (!Array.isArray(data.keys)) throw new Error("Google signing keys response was invalid.");
  googleJwksCache = data.keys;
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 300);
  googleJwksExpiresAt = Date.now() + Math.max(60, Math.min(maxAge, 3600)) * 1000;
  return googleJwksCache;
}

async function verifyGoogleIdToken(idToken, expectedNonce) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Google sign-in is not configured.");
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("Google returned an invalid identity token.");

  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Google returned an invalid identity token.");
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Unsupported Google identity token.");
  const keys = await googleSigningKeys();
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA" && key.alg === "RS256");
  if (!jwk) throw new Error("Google signing key was not found.");
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const validSignature = verifySignature(
    "RSA-SHA256",
    Buffer.from(parts[0] + "." + parts[1]),
    publicKey,
    Buffer.from(parts[2], "base64url")
  );
  if (!validSignature) throw new Error("Google identity token signature was invalid.");

  const now = Math.floor(Date.now() / 1000);
  const audienceValid = claims.aud === clientId || (Array.isArray(claims.aud) && claims.aud.includes(clientId));
  if (!["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)) throw new Error("Invalid Google identity issuer.");
  if (!audienceValid) throw new Error("Google identity token audience did not match.");
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("Google identity token has expired.");
  if (typeof claims.iat !== "number" || claims.iat > now + 60) throw new Error("Google identity token was issued in the future.");
  if (!secureEqual(String(claims.nonce || ""), expectedNonce)) throw new Error("Google identity token nonce did not match.");
  if (claims.email_verified !== true || typeof claims.email !== "string" || typeof claims.sub !== "string") {
    throw new Error("Google did not return a verified email address.");
  }
  return claims;
}

function clearGoogleStateCookie() {
  return "neurogrip_google_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/google/callback; Max-Age=0";
}

async function beginGoogleSignIn(req, res) {
  if (await isRateLimited(req)) return sendJson(res, 429, { code: "rate_limited" });
  const body = await readBody(req);
  if (body.acceptTerms !== true) return sendJson(res, 400, { code: "terms_required" });
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return sendJson(res, 503, { code: "google_not_configured" });
  }
  const state = randomBytes(32).toString("hex");
  const nonce = randomBytes(24).toString("hex");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  await db().query("DELETE FROM ng_google_oauth_states WHERE expires_at <= NOW()", []);
  await db().query(
    "INSERT INTO ng_google_oauth_states (state_hash, nonce, code_verifier, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')",
    [hashToken(state), nonce, codeVerifier]
  );

  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const stateCookie = "neurogrip_google_state=" + encodeURIComponent(state) +
    "; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/google/callback; Max-Age=600";
  return sendJson(res, 200, { url: authorizationUrl.toString() }, { "Set-Cookie": stateCookie });
}

async function completeGoogleSignIn(req, res, url) {
  const baseUrl = appBaseUrl(req);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const cookieState = getCookie(req, "neurogrip_google_state");
  const failed = (reason) => sendRedirect(res, baseUrl + "/?authError=" + encodeURIComponent(reason), [clearGoogleStateCookie()]);
  if (url.searchParams.get("error")) return failed("google_cancelled");
  if (!state || !code || !cookieState || !secureEqual(state, cookieState)) return failed("google_state_invalid");

  const stateRows = await db().query(
    "DELETE FROM ng_google_oauth_states WHERE state_hash = $1 AND expires_at > NOW() RETURNING nonce, code_verifier",
    [hashToken(state)]
  );
  const savedState = stateRows[0];
  if (!savedState) return failed("google_state_expired");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(req),
      grant_type: "authorization_code",
      code_verifier: savedState.code_verifier,
    }),
  });
  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text().catch(() => "");
    console.error("[neurogrip-google] Token exchange failed", tokenResponse.status, errorBody.slice(0, 240));
    return failed("google_exchange_failed");
  }
  const tokenData = await tokenResponse.json();
  const claims = await verifyGoogleIdToken(tokenData.id_token, savedState.nonce);
  const email = String(claims.email).trim().toLowerCase();

  let users = await db().query(
    "SELECT id, role, name, email, profile_phone, preferred_hand, google_sub FROM ng_users WHERE google_sub = $1 LIMIT 1",
    [claims.sub]
  );
  let user = users[0] || null;

  if (!user) {
    const existingRows = await db().query(
      "SELECT id, role, name, email, profile_phone, preferred_hand, google_sub FROM ng_users WHERE lower(email) = lower($1) LIMIT 1",
      [email]
    );
    const existing = existingRows[0] || null;
    if (existing) {
      const emailDomain = email.split("@")[1] || "";
      const googleIsAuthoritative = emailDomain === "gmail.com" || Boolean(claims.hd);
      if (!googleIsAuthoritative) return failed("google_link_requires_password");
      if (existing.google_sub && existing.google_sub !== claims.sub) return failed("google_account_conflict");
      const linkedRows = await db().query(
        "UPDATE ng_users SET google_sub = $1, terms_accepted_at = COALESCE(terms_accepted_at, NOW()) WHERE id = $2 RETURNING id, role, name, email, profile_phone, preferred_hand, google_sub",
        [claims.sub, existing.id]
      );
      user = linkedRows[0] || null;
    } else {
      const name = cleanText(claims.name || claims.given_name || email.split("@")[0], 80) || "NEUROGRIP user";
      const userId = "user-" + randomUUID();
      const newRows = await db().query(
        "INSERT INTO ng_users (id, role, name, email, password_salt, password_hash, google_sub, preferred_hand, terms_accepted_at) VALUES ($1, 'patient', $2, $3, '', '', $4, 'right', NOW()) RETURNING id, role, name, email, profile_phone, preferred_hand, google_sub",
        [userId, name, email, claims.sub]
      );
      user = newRows[0] || null;
      if (user) await notifyUsers([user], { type: "welcome" });
    }
  }
  if (!user) return failed("google_account_unavailable");

  const sessionToken = await createSession(user.id);
  return sendRedirect(res, baseUrl + "/?auth=google", [
    cookieHeader(sessionToken, SESSION_TTL_SECONDS),
    clearGoogleStateCookie(),
  ]);
}

async function requestPasswordReset(req, res) {
  if (!emailDeliveryConfigured()) return sendJson(res, 503, {
    code: "email_not_configured",
    error: "Password recovery email is not configured yet.",
  });
  if (await isRateLimited(req)) return sendJson(res, 429, { code: "rate_limited" });
  const body = await readBody(req);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { code: "invalid_email" });

  const users = await db().query(
    "SELECT id, name, email FROM ng_users WHERE lower(email) = lower($1) LIMIT 1",
    [email]
  );
  const user = users[0];
  if (user) {
    const token = randomBytes(32).toString("hex");
    await db().query("DELETE FROM ng_password_reset_tokens WHERE user_id = $1", [user.id]);
    await db().query(
      "INSERT INTO ng_password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 minutes')",
      [hashToken(token), user.id]
    );
    const resetUrl = appBaseUrl(req) + "/#reset=" + encodeURIComponent(token);
    const safeName = escapeHtml(user.name);
    const html = `<!doctype html><html><body style="margin:0;background:#f3f7f8;font-family:Arial,sans-serif;padding:32px 12px;color:#163746"><div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #dce8eb;border-radius:18px;padding:32px"><div style="font-size:13px;font-weight:800;letter-spacing:3px;color:#0d988e">NEUROGRIP</div><h1 style="font-size:24px;margin:24px 0 10px">Reset your password</h1><p style="line-height:1.7;color:#627984">Hello ${safeName}, we received a request to reset your NEUROGRIP password.</p><p style="line-height:1.7;color:#627984">This secure link expires in 30 minutes and can only be used once.</p><p style="margin:28px 0"><a href="${resetUrl}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#0d988e;color:#fff;text-decoration:none;font-weight:700">Create a new password</a></p><p style="font-size:12px;color:#81939a;line-height:1.6">If you did not request this change, you can safely ignore this email. Your password will not change.</p></div></body></html>`;
    const text = `Hello ${user.name},\n\nReset your NEUROGRIP password using this one-time link (valid for 30 minutes):\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
    await sendAuthEmail({ to: user.email, subject: "Reset your NEUROGRIP password", html, text });
  }
  return sendJson(res, 200, {
    ok: true,
    message: "If an account exists for that email, a password reset link has been sent.",
  });
}

async function resetPassword(req, res) {
  if (await isRateLimited(req)) return sendJson(res, 429, { code: "rate_limited" });
  const body = await readBody(req);
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return sendJson(res, 400, { code: "weak_password" });
  }
  if (token.length < 32 || token.length > 128) return sendJson(res, 400, { code: "reset_token_invalid" });

  const rows = await db().query(
    "DELETE FROM ng_password_reset_tokens WHERE token_hash = $1 AND expires_at > NOW() RETURNING user_id",
    [hashToken(token)]
  );
  if (!rows.length) return sendJson(res, 400, { code: "reset_token_invalid" });
  const userId = rows[0].user_id;
  const passwordRecord = await makePasswordRecord(password);
  await db().query(
    "UPDATE ng_users SET password_salt = $1, password_hash = $2 WHERE id = $3",
    [passwordRecord.salt, passwordRecord.hash, userId]
  );
  await db().query("DELETE FROM ng_sessions WHERE user_id = $1", [userId]);
  const userRows = await db().query(
    "SELECT id, role, name, email, profile_phone, preferred_hand FROM ng_users WHERE id = $1 LIMIT 1",
    [userId]
  );
  const user = userRows[0];
  if (!user) return sendJson(res, 400, { code: "reset_token_invalid" });
  const sessionToken = await createSession(userId);
  return sendJson(res, 200, { ok: true, user: publicUser(user) }, {
    "Set-Cookie": cookieHeader(sessionToken, SESSION_TTL_SECONDS),
  });
}

async function isRateLimited(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = String(req.headers["x-real-ip"] || (Array.isArray(forwarded) ? forwarded[0] : forwarded || "unknown")).split(",")[0].trim();
  const ipHash = createHash("sha256").update(ip).digest("hex");
  const rows = await db().query(
    "INSERT INTO ng_auth_rate_limits (ip_hash, window_started_at, attempts) VALUES ($1, NOW(), 1) ON CONFLICT (ip_hash) DO UPDATE SET attempts = CASE WHEN ng_auth_rate_limits.window_started_at < NOW() - INTERVAL '1 minute' THEN 1 ELSE ng_auth_rate_limits.attempts + 1 END, window_started_at = CASE WHEN ng_auth_rate_limits.window_started_at < NOW() - INTERVAL '1 minute' THEN NOW() ELSE ng_auth_rate_limits.window_started_at END RETURNING attempts",
    [ipHash]
  );
  return Number(rows[0]?.attempts || 0) > 12;
}

async function sessionUser(req) {
  const token = getCookie(req, COOKIE_NAME);
  if (!token) return null;
  const rows = await db().query(
    "SELECT u.id, u.role, u.name, u.email, u.profile_phone, u.preferred_hand FROM ng_sessions s JOIN ng_users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW() LIMIT 1",
    [hashToken(token)]
  );
  return rows[0] || null;
}

async function createSession(userId) {
  await db().query("DELETE FROM ng_sessions WHERE expires_at <= NOW()", []);
  const token = randomBytes(32).toString("hex");
  await db().query(
    "INSERT INTO ng_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '8 hours')",
    [hashToken(token), userId]
  );
  return token;
}

async function notifyUsers(users, notification) {
  const uniqueIds = [...new Set(users.map((user) => user && user.id).filter(Boolean))];
  for (const userId of uniqueIds) {
    await db().query(
      "INSERT INTO ng_notifications (id, user_id, type, ticket_id, subject, actor_role) VALUES ($1, $2, $3, $4, $5, $6)",
      [randomUUID(), userId, notification.type, notification.ticketId || null, notification.subject || "", notification.actorRole || ""]
    );
  }
}

async function usersByRole(role) {
  return db().query("SELECT id, role, name, email FROM ng_users WHERE role = $1", [role]);
}

function ticketFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    category: row.category,
    subject: row.subject,
    description: row.description,
    status: row.status,
    sharedWithDeveloper: row.shared_with_developer === true,
    forwardedToDeveloper: row.forwarded_to_developer === true,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    messages: Array.isArray(row.messages) ? row.messages : [],
  };
}

function canViewSupportTicket(user, ticket) {
  if (user.role === "patient") return ticket.patientId === user.id;
  if (user.role === "doctor") return true;
  return user.role === "developer" && ticket.sharedWithDeveloper && ticket.forwardedToDeveloper;
}

function supportTicketForUser(user, ticket) {
  if (user.role !== "developer") return ticket;
  return {
    ...ticket,
    patientId: "",
    patientName: "Patient",
    messages: ticket.messages.map((message) => ({
      ...message,
      authorId: message.authorId === user.id ? user.id : message.authorRole === "patient" ? "patient" : message.authorId,
      authorName: message.authorRole === "patient" ? "Patient" : message.authorName,
    })),
  };
}

async function accountById(userId) {
  const rows = await db().query("SELECT id, role, name, email FROM ng_users WHERE id = $1 LIMIT 1", [userId]);
  return rows[0] || null;
}

async function ticketById(ticketId) {
  const rows = await db().query("SELECT * FROM ng_support_tickets WHERE id = $1 LIMIT 1", [ticketId]);
  return ticketFromRow(rows[0]);
}

async function notificationRecipientsForTicket(ticket, senderRole) {
  const recipients = [];
  const patient = await accountById(ticket.patientId);
  if (senderRole !== "patient" && patient) recipients.push(patient);
  if (senderRole !== "doctor") recipients.push(...await usersByRole("doctor"));
  if (ticket.sharedWithDeveloper && ticket.forwardedToDeveloper && senderRole !== "developer") {
    recipients.push(...await usersByRole("developer"));
  }
  if (senderRole === "developer") recipients.push(...await usersByRole("doctor"));
  return recipients;
}

function verifyOrigin(req) {
  const method = String(req.method || "GET").toUpperCase();
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return true;
  const origin = req.headers.origin;
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = String((Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.headers.host || "").split(",")[0].trim();
  if (!origin || !host) return process.env.NODE_ENV !== "production";
  try {
    const originUrl = new URL(origin);
    if (process.env.NODE_ENV === "production" && originUrl.protocol !== "https:") return false;
    const originHost = originUrl.host;
    if (originHost === host) return true;
    const isLocalHost = (value) => /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value);
    return isLocalHost(originHost) && isLocalHost(host);
  } catch {
    return false;
  }
}

async function handleRequest(req, res) {
  const sql = db();
  const url = new URL(req.url || "/", "https://neurogrip.local");
  const forwardedPath = url.searchParams.get("path");
  const pathname = forwardedPath ? "/api/" + (forwardedPath.startsWith("/") ? forwardedPath.slice(1) : forwardedPath) : url.pathname;
  const method = String(req.method || "GET").toUpperCase();

  if (pathname === "/api/health" && method === "GET") {
    await sql.query("SELECT 1 AS ok", []);
    return sendJson(res, 200, { ok: true, service: "neurogrip-api", database: "connected" });
  }
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method) && !verifyOrigin(req)) {
    return sendJson(res, 403, { error: "Cross-origin request rejected." });
  }
 
  if (pathname === "/api/auth/providers" && method === "GET") {
    return sendJson(res, 200, {
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      passwordReset: emailDeliveryConfigured(),
    });
  }

  if (pathname === "/api/auth/google/start" && method === "POST") {
    return beginGoogleSignIn(req, res);
  }

  if (pathname === "/api/auth/google/callback" && method === "GET") {
    try {
      return await completeGoogleSignIn(req, res, url);
    } catch (error) {
      console.error("[neurogrip-google] Callback failed", error && error.message ? error.message : "Unknown error");
      return sendRedirect(res, appBaseUrl(req) + "/?authError=google_failed", [clearGoogleStateCookie()]);
    }
  }

  if (pathname === "/api/auth/forgot-password" && method === "POST") {
    try {
      return await requestPasswordReset(req, res);
    } catch (error) {
      if (error && error.code === "email_delivery_failed") {
        return sendJson(res, 503, { code: "email_delivery_failed" });
      }
      throw error;
    }
  }

  if (pathname === "/api/auth/reset-password" && method === "POST") {
    return resetPassword(req, res);
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    if (await isRateLimited(req)) return sendJson(res, 429, { error: "Too many sign-in attempts. Try again in one minute." });
    const body = await readBody(req);
    const role = typeof body.role === "string" ? body.role : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!["patient", "doctor", "developer"].includes(role) || !email || !password) {
      return sendJson(res, 400, { error: "A valid role, email, and password are required." });
    }
    const rows = await sql.query("SELECT * FROM ng_users WHERE email = $1 AND role = $2 LIMIT 1", [email, role]);
    const account = rows[0];
    if (!account || !(await passwordMatches(password, { salt: account.password_salt, hash: account.password_hash }))) {
      return sendJson(res, 401, { error: "Invalid email, password, or account role." });
    }
    const token = await createSession(account.id);
    return sendJson(res, 200, { user: publicUser(account) }, { "Set-Cookie": cookieHeader(token, SESSION_TTL_SECONDS) });
  }

  if (pathname === "/api/auth/register" && method === "POST") {
    if (await isRateLimited(req)) return sendJson(res, 429, { code: "rate_limited" });
    const body = await readBody(req);
    const role = typeof body.role === "string" ? body.role : "";
    const name = cleanText(body.name, 80);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";
    const phone = cleanText(body.phone, 30);
    const preferredHand = body.preferredHand === "left" ? "left" : body.preferredHand === "right" ? "right" : "right";
    if (!["patient", "doctor", "developer"].includes(role)) return sendJson(res, 400, { code: "invalid_role" });
    if (phone && !/^[+0-9().\s-]{7,30}$/.test(phone)) return sendJson(res, 400, { code: "invalid_phone" });
    if (body.acceptTerms !== true) return sendJson(res, 400, { code: "terms_required" });
    if (name.length < 2) return sendJson(res, 400, { code: "invalid_name" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { code: "invalid_email" });
    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) return sendJson(res, 400, { code: "weak_password" });
    if (role === "doctor" && !process.env.DOCTOR_INVITE_CODE) return sendJson(res, 403, { code: "invite_not_configured" });
    if (role === "developer" && !process.env.DEVELOPER_INVITE_CODE) return sendJson(res, 403, { code: "invite_not_configured" });
    if (role === "doctor" && !secureEqual(inviteCode, process.env.DOCTOR_INVITE_CODE)) return sendJson(res, 403, { code: "invalid_invite" });
    if (role === "developer" && !secureEqual(inviteCode, process.env.DEVELOPER_INVITE_CODE)) return sendJson(res, 403, { code: "invalid_invite" });

    const passwordRecord = await makePasswordRecord(password);
    const account = { id: "user-" + randomUUID(), role, name, email, profile_phone: phone || null, preferred_hand: preferredHand };
    try {
      await sql.query(
        "INSERT INTO ng_users (id, role, name, email, password_salt, password_hash, profile_phone, preferred_hand, terms_accepted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())",
        [account.id, role, name, email, passwordRecord.salt, passwordRecord.hash, phone || null, preferredHand]
      );
    } catch (error) {
      if (error && error.code === "23505") return sendJson(res, 409, { code: "email_exists" });
      throw error;
    }
    const token = await createSession(account.id);
    await notifyUsers([account], { type: "welcome" });
    return sendJson(res, 201, { user: publicUser(account) }, { "Set-Cookie": cookieHeader(token, SESSION_TTL_SECONDS) });
  }

  if (pathname === "/api/auth/profile" && method === "PATCH") {
    const user = await sessionUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in required." });
    const body = await readBody(req);
    const name = cleanText(body.name, 80);
    const phone = cleanText(body.phone, 30);
    const preferredHand = body.preferredHand === "left" ? "left" : body.preferredHand === "right" ? "right" : null;
    if (name.length < 2) return sendJson(res, 400, { code: "invalid_name" });
    if (phone && !/^[+0-9().\s-]{7,30}$/.test(phone)) return sendJson(res, 400, { code: "invalid_phone" });
    if (!preferredHand) return sendJson(res, 400, { code: "invalid_hand_preference" });
    const rows = await sql.query(
      "UPDATE ng_users SET name = $1, profile_phone = $2, preferred_hand = $3 WHERE id = $4 RETURNING id, role, name, email, profile_phone, preferred_hand",
      [name, phone || null, preferredHand, user.id]
    );
    return sendJson(res, 200, { user: publicUser(rows[0]) });
  }

  if (pathname === "/api/auth/me" && method === "GET") {
    const user = await sessionUser(req);
    if (!user) return sendJson(res, 401, { error: "Not signed in." });
    return sendJson(res, 200, publicUser(user));
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    const token = getCookie(req, COOKIE_NAME);
    if (token) await sql.query("DELETE FROM ng_sessions WHERE token_hash = $1", [hashToken(token)]);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": cookieHeader("", 0) });
  }

  const workspaceMatch = pathname.match(/^\/api\/(patient|doctor|developer)\/workspace$/);
  if (workspaceMatch && method === "GET") {
    const user = await sessionUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in required." });
    const requiredRole = workspaceMatch[1];
    if (user.role !== requiredRole) return sendJson(res, 403, { error: "Your account cannot access this workspace." });
    return sendJson(res, 200, { role: user.role, user: publicUser(user), sections: workspaceMap[user.role] });
  }

  if (pathname === "/api/notifications" && method === "GET") {
    const user = await sessionUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in required." });
    const rows = await sql.query(
      "SELECT id, type, ticket_id, subject, actor_role, created_at, read_at FROM ng_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [user.id]
    );
    const notifications = rows.map((item) => ({
      id: item.id, type: item.type, ticketId: item.ticket_id, subject: item.subject,
      actorRole: item.actor_role, createdAt: new Date(item.created_at).toISOString(),
      readAt: item.read_at ? new Date(item.read_at).toISOString() : null,
    }));
    return sendJson(res, 200, { notifications, unreadCount: notifications.filter((item) => !item.readAt).length });
  }

  const notificationReadMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (notificationReadMatch && method === "POST") {
    const user = await sessionUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in required." });
    const rows = await sql.query(
      "UPDATE ng_notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND user_id = $2 RETURNING id",
      [notificationReadMatch[1], user.id]
    );
    if (!rows.length) return sendJson(res, 404, { error: "Notification not found." });
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/notifications/read-all" && method === "POST") {
    const user = await sessionUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in required." });
    await sql.query("UPDATE ng_notifications SET read_at = COALESCE(read_at, NOW()) WHERE user_id = $1", [user.id]);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/support/tickets" && method === "GET") {
    const user = await sessionUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in required." });
    const rows = await sql.query(
      "SELECT * FROM ng_support_tickets ORDER BY updated_at DESC",
      []
    );
    const tickets = rows.map(ticketFromRow).filter((ticket) => canViewSupportTicket(user, ticket)).map((ticket) => supportTicketForUser(user, ticket));
    return sendJson(res, 200, { tickets });
  }

  if (pathname === "/api/support/tickets" && method === "POST") {
    const user = await sessionUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in required." });
    if (user.role !== "patient") return sendJson(res, 403, { error: "Only patients can create support requests." });
    const body = await readBody(req);
    const subject = cleanText(body.subject, 100);
    const description = cleanText(body.description, 2000);
    const category = ["device", "training", "other"].includes(body.category) ? body.category : null;
    if (subject.length < 3 || description.length < 5 || !category) {
      return sendJson(res, 400, { error: "A subject, issue type, and description are required." });
    }
    const ticketId = randomUUID();
    const rows = await sql.query(
      "INSERT INTO ng_support_tickets (id, patient_id, patient_name, category, subject, description, status, shared_with_developer, forwarded_to_developer) VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, false) RETURNING *",
      [ticketId, user.id, user.name, category, subject, description, body.sharedWithDeveloper === true]
    );
    const ticket = ticketFromRow(rows[0]);
    await notifyUsers(await usersByRole("doctor"), {
      type: "support_new_ticket", ticketId: ticket.id, subject: ticket.subject, actorRole: user.role,
    });
    return sendJson(res, 201, { ticket });
  }

  const supportMessageMatch = pathname.match(/^\/api\/support\/tickets\/([^/]+)\/messages$/);
  if (supportMessageMatch && method === "POST") {
    const user = await sessionUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in required." });
    const ticket = await ticketById(supportMessageMatch[1]);
    if (!ticket) return sendJson(res, 404, { error: "Support request not found." });
    if (!canViewSupportTicket(user, ticket)) return sendJson(res, 403, { error: "Your account cannot access this conversation." });
    const body = await readBody(req);
    const messageText = cleanText(body.text, 2000);
    if (!messageText) return sendJson(res, 400, { error: "A reply message is required." });
    const message = {
      id: randomUUID(), authorId: user.id, authorName: user.name, authorRole: user.role,
      text: messageText, createdAt: new Date().toISOString(),
    };
    const rows = await sql.query(
      "UPDATE ng_support_tickets SET messages = messages || $1::jsonb, updated_at = $2 WHERE id = $3 RETURNING *",
      [JSON.stringify([message]), message.createdAt, ticket.id]
    );
    const updatedTicket = ticketFromRow(rows[0]);
    const recipients = (await notificationRecipientsForTicket(updatedTicket, user.role)).filter((item) => item.id !== user.id);
    await notifyUsers(recipients, {
      type: "support_new_reply", ticketId: ticket.id, subject: ticket.subject, actorRole: user.role,
    });
    return sendJson(res, 201, { message, ticket: supportTicketForUser(user, updatedTicket) });
  }

  const supportTicketMatch = pathname.match(/^\/api\/support\/tickets\/([^/]+)$/);
  if (supportTicketMatch && method === "PATCH") {
    const user = await sessionUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in required." });
    const ticket = await ticketById(supportTicketMatch[1]);
    if (!ticket) return sendJson(res, 404, { error: "Support request not found." });
    if (!canViewSupportTicket(user, ticket)) return sendJson(res, 403, { error: "Your account cannot access this request." });
    const body = await readBody(req);
    const previousForwarded = ticket.forwardedToDeveloper;
    const previousStatus = ticket.status;

    if (user.role === "doctor") {
      if (body.forwardedToDeveloper !== undefined) {
        if (typeof body.forwardedToDeveloper !== "boolean") return sendJson(res, 400, { error: "Invalid sharing setting." });
        if (body.forwardedToDeveloper && !ticket.sharedWithDeveloper) {
          return sendJson(res, 403, { error: "The patient has not consented to share this request with the developer." });
        }
        ticket.forwardedToDeveloper = body.forwardedToDeveloper;
      }
    } else if (user.role !== "developer" || !ticket.forwardedToDeveloper || !ticket.sharedWithDeveloper) {
      return sendJson(res, 403, { error: "Only the doctor can manage this request." });
    }

    if (body.status !== undefined) {
      const permittedStatuses = user.role === "developer" ? ["in_progress", "resolved"] : ["open", "in_progress", "resolved"];
      if (!permittedStatuses.includes(body.status)) return sendJson(res, 400, { error: "Invalid request status." });
      ticket.status = body.status;
    }

    const rows = await sql.query(
      "UPDATE ng_support_tickets SET forwarded_to_developer = $1, status = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
      [ticket.forwardedToDeveloper, ticket.status, ticket.id]
    );
    const updatedTicket = ticketFromRow(rows[0]);

    if (!previousForwarded && updatedTicket.forwardedToDeveloper) {
      await notifyUsers(await usersByRole("developer"), {
        type: "support_forwarded", ticketId: ticket.id, subject: ticket.subject, actorRole: user.role,
      });
    }
    if (previousStatus !== updatedTicket.status) {
      const patient = await accountById(ticket.patientId);
      const recipients = [patient];
      if (user.role === "developer") recipients.push(...await usersByRole("doctor"));
      if (updatedTicket.forwardedToDeveloper && updatedTicket.sharedWithDeveloper) recipients.push(...await usersByRole("developer"));
      await notifyUsers(recipients.filter((item) => item && item.id !== user.id), {
        type: "support_status", ticketId: ticket.id, subject: ticket.subject, actorRole: user.role,
      });
    }
    return sendJson(res, 200, { ticket: supportTicketForUser(user, updatedTicket) });
  }

  return sendJson(res, 404, { error: "Not found." });
}

export default async function handler(req, res) {
  const url = new URL(req.url || "/", "https://neurogrip.local");
  try {
    await ensureSchema();
    return await handleRequest(req, res);
  } catch (error) {
    const routePath = url.searchParams.get("path");
    console.error("[neurogrip-api]", routePath ? "/api/" + routePath : url.pathname, error && error.message ? error.message : "Request failed");
    const status = error && error.message === "Invalid JSON." ? 400 : 503;
    return sendJson(res, status, {
      error: status === 400 ? "Invalid JSON request." : "The account service is temporarily unavailable.",
      code: status === 400 ? "invalid_json" : "service_unavailable",
    });
  }
}
