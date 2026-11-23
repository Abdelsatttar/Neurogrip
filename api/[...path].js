import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const COOKIE_NAME = "neurogrip_session";
let sqlClient;
let schemaPromise;

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
  return { userId: user.id, role: user.role, name: user.name, email: user.email };
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
    "SELECT u.id, u.role, u.name, u.email FROM ng_sessions s JOIN ng_users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW() LIMIT 1",
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
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function handleRequest(req, res) {
  const sql = db();
  const url = new URL(req.url || "/", "https://neurogrip.local");
  const pathname = url.pathname;
  const method = String(req.method || "GET").toUpperCase();

  if (pathname === "/api/health" && method === "GET") {
    await sql.query("SELECT 1 AS ok", []);
    return sendJson(res, 200, { ok: true, service: "neurogrip-api", database: "connected" });
  }

  if (!verifyOrigin(req)) {
    return sendJson(res, 403, { error: "Cross-origin request rejected." });
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
    if (!["patient", "doctor", "developer"].includes(role)) return sendJson(res, 400, { code: "invalid_role" });
    if (name.length < 2) return sendJson(res, 400, { code: "invalid_name" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { code: "invalid_email" });
    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) return sendJson(res, 400, { code: "weak_password" });
    if (role === "doctor" && !process.env.DOCTOR_INVITE_CODE) return sendJson(res, 403, { code: "invite_not_configured" });
    if (role === "developer" && !process.env.DEVELOPER_INVITE_CODE) return sendJson(res, 403, { code: "invite_not_configured" });
    if (role === "doctor" && !secureEqual(inviteCode, process.env.DOCTOR_INVITE_CODE)) return sendJson(res, 403, { code: "invalid_invite" });
    if (role === "developer" && !secureEqual(inviteCode, process.env.DEVELOPER_INVITE_CODE)) return sendJson(res, 403, { code: "invalid_invite" });

    const passwordRecord = await makePasswordRecord(password);
    const account = { id: "user-" + randomUUID(), role, name, email };
    try {
      await sql.query(
        "INSERT INTO ng_users (id, role, name, email, password_salt, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [account.id, role, name, email, passwordRecord.salt, passwordRecord.hash]
      );
    } catch (error) {
      if (error && error.code === "23505") return sendJson(res, 409, { code: "email_exists" });
      throw error;
    }
    const token = await createSession(account.id);
    await notifyUsers([account], { type: "welcome" });
    return sendJson(res, 201, { user: publicUser(account) }, { "Set-Cookie": cookieHeader(token, SESSION_TTL_SECONDS) });
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
    console.error("[neurogrip-api]", url.pathname, error && error.message ? error.message : "Request failed");
    const status = error && error.message === "Invalid JSON." ? 400 : 503;
    return sendJson(res, status, {
      error: status === 400 ? "Invalid JSON request." : "The account service is temporarily unavailable.",
      code: status === 400 ? "invalid_json" : "service_unavailable",
    });
  }
}
