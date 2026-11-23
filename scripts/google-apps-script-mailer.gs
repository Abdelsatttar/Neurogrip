/**
 * NEUROGRIP password-reset email bridge.
 *
 * Deploy this file as a Google Apps Script Web app:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Before deploying, add this Script Property:
 *   NEUROGRIP_MAIL_SECRET = the same strong random secret stored in Vercel
 *   as GOOGLE_APPS_SCRIPT_SECRET.
 *
 * Do not put the secret in source control.
 */

const SECRET_PROPERTY = "NEUROGRIP_MAIL_SECRET";

function doGet() {
  return jsonOutput({ ok: true, service: "neurogrip-mailer" });
}

function doPost(event) {
  try {
    const payload = JSON.parse(event && event.postData && event.postData.contents || "{}");
    const expectedSecret = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY);

    if (!expectedSecret || !constantTimeEquals(String(payload.secret || ""), expectedSecret)) {
      return jsonOutput({ ok: false, code: "unauthorized" });
    }

    const to = String(payload.to || "").trim();
    const subject = String(payload.subject || "").trim().slice(0, 180);
    const html = String(payload.html || "");
    const text = String(payload.text || "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || (!html && !text)) {
      return jsonOutput({ ok: false, code: "invalid_message" });
    }

    if (MailApp.getRemainingDailyQuota() < 1) {
      return jsonOutput({ ok: false, code: "daily_quota_exceeded" });
    }

    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: text || "Please open this message in an HTML-capable email client.",
      htmlBody: html || undefined,
      name: "NEUROGRIP"
    });

    return jsonOutput({ ok: true });
  } catch (error) {
    console.error("NEUROGRIP mailer failed:", error && error.message ? error.message : "Unknown error");
    return jsonOutput({ ok: false, code: "send_failed" });
  }
}

function constantTimeEquals(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function jsonOutput(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
