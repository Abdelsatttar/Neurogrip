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

Open `http://localhost:5173/`. Vite proxies `/api` requests to the local Node service on port 4000. The local service stores development accounts, support tickets, and notifications in `server/data/` JSON files. This file-based mode is only for local development; it is not used by the Vercel API.

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

The `api/[...path].js` function handles the application's `/api/*` routes. It uses the Neon PostgreSQL connection supplied by the Vercel Neon integration. On its first request, it creates the required tables and indexes if they do not already exist.

The Vercel project must have these server-side environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string, supplied by the integration |
| `DOCTOR_INVITE_CODE` | Private invitation code for creating Doctor accounts |
| `DEVELOPER_INVITE_CODE` | Private invitation code for creating Developer accounts |

Set the invitation variables in Vercel Project Settings → Environment Variables for Production and Preview. Mark them as Sensitive/Encrypted. Never prefix secrets with `VITE_` and never place database credentials or invitation codes in frontend code. Redeploy after changing environment variables.

## API routes

- `GET /api/health` — API and database health check
- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/{patient|doctor|developer}/workspace` — role-checked workspace access
- `GET /api/notifications`, `POST /api/notifications/read-all`, `POST /api/notifications/:id/read`
- `GET /api/support/tickets`, `POST /api/support/tickets`
- `POST /api/support/tickets/:id/messages`, `PATCH /api/support/tickets/:id`

## Accounts and security

Passwords are hashed on the server using scrypt with a random salt. Session tokens are sent in HttpOnly, SameSite cookies and only their SHA-256 hashes are stored in PostgreSQL. Sessions expire after eight hours. Login and registration attempts are rate-limited by client address. Doctor and Developer role registration is denied unless the matching server-side invitation code is configured and supplied.

The production database stores registered accounts, hashed credentials, hashed sessions, in-app notifications, and support requests/messages. Support visibility is role-checked: patients see their own requests, doctors can review requests, and developers can see only requests that the patient consented to share and that a doctor forwarded.

Password reset, email ownership verification, external email/SMS delivery, and browser push notifications are not implemented. Patient profile preferences, learning progress, and demo device status remain browser-local. The clinical/specialist workspace prototype must not be treated as a medical record system.

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
