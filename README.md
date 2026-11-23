# NEUROGRIP

Responsive React + TypeScript application for the NEUROGRIP EMG-powered prosthetic hand graduation project.

## Technology

- React 18, TypeScript, and Vite
- Node.js API on Vercel Functions
- Neon PostgreSQL through `@neondatabase/serverless`
- Framer Motion and Lucide React

## Local development

Install dependencies:

```bash
npm install
```

Start the Vite frontend and the local development API:

```bash
npm run dev
```

Open `http://localhost:5173/`. Vite proxies `/api` requests to the local Node service on port 4000. The local service stores development accounts, support tickets, and notifications in `server/data/` JSON files. This file-based mode is only for local development; it is not used by the Vercel API. The local service also stores the account's phone number and preferred hand. Google sign-in and email-based password recovery are production integrations and remain unavailable in this local file-based mode; use the Production deployment to test those flows.

Doctor and Developer registration require local invitation codes. Copy `.env.example` to `.env`, fill in private values for both invitation codes, then run the app. `.env` is ignored by Git:

```powershell
Copy-Item .env.example .env
# Edit .env and set both private invitation codes
npm run dev
```

Patient registration does not require an invitation code. There are no pre-created demo accounts or publicly shared demo passwords.

Build the frontend:

```bash
npm run build
```

## Production deployment on Vercel

The `api/handler.js` function handles the application's `/api/*` routes. A Vercel rewrite sends every API path to this single function while preserving its route in a query parameter. The function uses the Neon PostgreSQL connection supplied by the Vercel Neon integration. On its first request, it creates the required tables and indexes if they do not already exist.

The Vercel project uses these server-side environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string, supplied by the integration |
| `DOCTOR_INVITE_CODE` | Private invitation code for Doctor accounts |
| `DEVELOPER_INVITE_CODE` | Private invitation code for Developer accounts |
| `APP_BASE_URL` | Canonical production origin: `https://neurogrip-vert.vercel.app` |
| `GOOGLE_CLIENT_ID` | Google OAuth Web application client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Web application client secret |
| `GOOGLE_REDIRECT_URI` | `https://neurogrip-vert.vercel.app/api/auth/google/callback` |
| `RESEND_API_KEY` | Resend API key used to send password recovery messages |
| `EMAIL_FROM` | Sender address on a domain verified in Resend, e.g. `NEUROGRIP <no-reply@your-verified-domain.com>` |

The Neon connection variables are supplied by the Vercel integration. The invitation codes, Google client secret, Apps Script shared secret, and Resend API key must be stored as Sensitive/Encrypted Vercel Production variables. `APP_BASE_URL`, `GOOGLE_REDIRECT_URI`, the Apps Script URL, and `EMAIL_FROM` are not secret. Never prefix secrets with `VITE_` and never put credentials in frontend code, Git, or chat messages.

### Enable Google sign-in

1. In Google Cloud Console, create or select a project and configure its OAuth consent screen.
2. Create an OAuth 2.0 Client ID with application type **Web application**.
3. Add this exact Authorized JavaScript origin: `https://neurogrip-vert.vercel.app`.
4. Add this exact Authorized redirect URI: `https://neurogrip-vert.vercel.app/api/auth/google/callback`.
5. Save the generated client ID as `GOOGLE_CLIENT_ID` and the client secret as `GOOGLE_CLIENT_SECRET` in Vercel Project Settings → Environment Variables → Production.

Google sign-in creates Patient accounts. Existing verified Gmail/Google Workspace accounts may be linked to an account with the same email; accounts using other email domains must first sign in with their existing password. Doctor and Developer registration remains invitation-code controlled.

### Enable password recovery email without buying a domain

NEUROGRIP supports a Google Apps Script mailer that sends through the Gmail account that owns the script. This is suitable for a graduation-project prototype and does not require a custom domain, Resend, SMTP credentials, or a new npm dependency.

1. Open [Google Apps Script](https://script.google.com/) and create a new project.
2. Copy the code from `scripts/google-apps-script-mailer.gs` into the script editor and save it.
3. In **Project Settings → Script Properties**, add `NEUROGRIP_MAIL_SECRET` with a long random secret (at least 32 characters). Use the exact same secret in Vercel; never commit it or send it in chat.
4. Click **Deploy → New deployment → Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**, then deploy and approve the MailApp permission request.
5. Copy the Web app URL ending in `/exec`. In Vercel Project Settings → Environment Variables → Production, add `GOOGLE_APPS_SCRIPT_URL` and `GOOGLE_APPS_SCRIPT_SECRET`.
6. Redeploy Production. Verify `GET /api/auth/providers` returns `"passwordReset":true`, then test Forgot Password using an account you own.

The script checks the shared secret before sending. It sends as the Google account that owns the Apps Script deployment. Google currently lists a daily limit of 100 email recipients for consumer Gmail accounts; quotas may change. Use this as a low-volume prototype mailer, not a bulk email service.

Resend remains available as an alternative when a verified sender domain is configured. If both providers are configured, Google Apps Script is selected first.

## API routes

- `GET /api/health` — API and database health check
- `GET /api/auth/providers` — reports which optional sign-in providers are configured
- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/auth/me`, `POST /api/auth/logout`, `PATCH /api/auth/profile`
- `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- `POST /api/auth/google/start`, `GET /api/auth/google/callback`
- `GET /api/{patient|doctor|developer}/workspace` — role-checked workspace access
- `GET /api/notifications`, `POST /api/notifications/read-all`, `POST /api/notifications/:id/read`
- `GET /api/support/tickets`, `POST /api/support/tickets`
- `POST /api/support/tickets/:id/messages`, `PATCH /api/support/tickets/:id`

## Accounts and security

Passwords are hashed on the server using scrypt with a random salt. Session tokens are sent in HttpOnly, SameSite cookies and only their SHA-256 hashes are stored in PostgreSQL. Sessions expire after eight hours. Login and registration attempts are rate-limited by client address. Doctor and Developer role registration is denied unless the matching server-side invitation code is configured and supplied.

The production database stores registered accounts, hashed credentials, hashed sessions, in-app notifications, and support requests/messages. Support visibility is role-checked: patients see their own requests, doctors can review requests, and developers can see only requests that the patient consented to share and that a doctor forwarded.

Email-based password recovery and Google OAuth are implemented in the production API. They stay unavailable until the corresponding Google OAuth or email provider variables are configured in Vercel. Password recovery can use the domain-free Google Apps Script mailer or Resend with a verified sender domain. Email ownership verification for ordinary password registration, passwordless magic links, email/SMS notifications, and browser push notifications are not implemented. Account name, phone, preferred hand, and a private compressed profile photo are stored in PostgreSQL; users can upload a picture or capture one with their device camera, and can change a password after confirming the current password. Changing a password revokes other active sessions; language/theme preferences, learning progress, and demo device status remain browser-local. The clinical/specialist workspace prototype must not be treated as a medical record system.

**Important:** NEUROGRIP is a graduation-project prototype, not a certified medical device or clinical information system. Do not enter real patient or other sensitive health information. Before any real-world clinical use, the project needs a formal privacy/security review, patient-to-doctor assignment rules, audit logging, backups, account recovery, and appropriate regulatory and clinical validation.

## Role-separated workspaces

- **Patient:** Dashboard, How to Use, EMG Learning, Support & Communication, My Profile, and Settings.
- **Doctor:** Clinical overview, patient cases, follow-up notes, progress reports, and Support & Communication.
- **Developer:** Device overview, ESP32/EMG/motor diagnostics, device event logs, and Support & Communication.

## Included prototype features

- Patient dashboard with simulated prosthetic-hand battery status until a real telemetry bridge is connected
- EMG learning modules and a fixed MP4 lesson asset
- Doctor workspace for prototype patient cases, notes, follow-up dates, reports, printing, and CSV export
- Developer workspace for ESP32 connection, battery, EMG sensor, motor, firmware, and diagnostic events
- Support center with patient consent for sharing a request with the developer, doctor forwarding, status tracking, and shared conversation history
- In-app notifications for registration and support activity
- English/Arabic interface, RTL/LTR layout, light/dark themes, and responsive layouts

## Device integration hooks

Battery bridge event:

```ts
window.dispatchEvent(new CustomEvent('neurogrip:battery', {
  detail: { level: 82, charging: false },
}))
```

Developer diagnostics event:

```ts
window.dispatchEvent(new CustomEvent('neurogrip:diagnostics', {
  detail: {
    connected: true,
    emgStatus: 'ready',
    motorStatus: 'idle',
    firmwareVersion: '1.0.0',
    errorMessage: '',
  },
}))
```

These are frontend integration contracts only. They do not implement Bluetooth, Wi-Fi, serial communication, EMG acquisition, servo control, or ESP32 firmware. Those components must be integrated and tested with the physical hardware.
