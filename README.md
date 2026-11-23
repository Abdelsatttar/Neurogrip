# NEUROGRIP

Responsive React + TypeScript application for the NEUROGRIP EMG-powered prosthetic hand project.

## Stack

- React 18 + TypeScript + Vite
- Framer Motion
- Lucide React icons
- Small Node.js authentication service (built-in Node modules only)

## Run locally

Install the frontend packages once:

```bash
npm install
```

Start both the Vite frontend and the local authentication service:

```bash
npm run dev
```

Open `http://localhost:5173/`. Keep the terminal window open while using the app. The Vite server proxies `/api` requests to the authentication service on port `4000`.

For a local-network demo, keep this computer running the project and open `http://<host-computer-IPv4>:5173/` on another device connected to the same Wi-Fi. On Windows, find the host IPv4 address with `ipconfig`. Allow the Vite development server through the firewall when Windows asks. This is for a trusted local-network demo only; it does not publish the app to the internet.

Create a production frontend build with:

```bash
npm run build
```

The production deployment must also host the Node authentication service behind the same site origin (or configure a secure same-site API deployment). `npm run preview` only previews the static frontend; it does not start the authentication service.

## Registration and demo accounts

The sign-in screen includes a **Create account** option. Patients can register with their name, email, and a password (minimum 8 characters). Doctor and Developer registration requires a role-specific invitation code so a visitor cannot simply grant themselves staff access. The local demo invitation codes are:

- Doctor: `NG-DOCTOR-DEMO-2026`
- Developer: `NG-DEVELOPER-DEMO-2026`

Set your own `DOCTOR_INVITE_CODE` and `DEVELOPER_INVITE_CODE` environment variables before starting the server outside a local demo. Do not use the built-in demo codes for a public deployment. New registered accounts and salted password hashes are stored in `server/data/accounts.json` on the host computer. Email ownership is not verified in this prototype, so do not use real patient records.

Select a role on the sign-in page, then use the matching demo credentials:

| Role | Email | Password |
|---|---|---|
| Patient | `patient.demo@neurogrip.local` | `Patient#2026` |
| Doctor | `doctor.demo@neurogrip.local` | `Doctor#2026` |
| Developer | `developer.demo@neurogrip.local` | `Developer#2026` |

The backend verifies both the account and its role. A correct password for a different role is not accepted. Sign out to return to the sign-in page and switch accounts.

## Role-separated workspaces

- **Patient:** Dashboard, How to Use, EMG Learning, Support & Communication, My Profile, and Settings.
- **Doctor:** Clinical overview, patient cases, follow-up notes, progress reports, and Support & Communication.
- **Developer:** Device overview, ESP32/EMG/motor diagnostics, device event logs, and Support & Communication.

The sidebar is filtered by the signed-in role. Patient pages do not show doctor or developer tools. Doctor pages do not show patient-only learning pages or developer diagnostics. Developer pages do not show patient records or clinical notes. The local browser data keys are also namespaced by the authenticated account ID.

The Node service provides `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, and role-checked `/api/{role}/workspace` endpoints. Passwords are stored as salted scrypt hashes and the session token is stored in an HttpOnly, SameSite cookie. Sessions are kept in memory and expire after eight hours; restarting the local service signs all users out. Registration invitation codes are checked on the server, not only in the UI.

## Important security and data notes

These are demo accounts for local development only. Their credentials are intentionally included here so the project can be tested. Do not publish this build with the demo accounts or enter real patient data. Before real-world use, replace the demo accounts with managed accounts, store records in a protected database, add account provisioning and password reset, enforce HTTPS, add audit logging and backups, and test the complete access-control model. Browser `localStorage` is separated by account for this prototype but is not a secure store for clinical information. The current case records and patient preferences are still local to the browser; they are not synchronized between different devices or users.

The support feature stores demo tickets and replies in `server/data/support-tickets.json` on the computer hosting the Node service, so browsers using the same running host see the same requests. The patient can create a request and explicitly choose whether the doctor may share that request and its conversation with the developer. The doctor can read and reply to requests, update their status, and forward a request only when the patient gave consent. The developer can only read and reply to requests that were both consented to and forwarded by the doctor; the developer view masks the patient's demo account ID and name. The interface refreshes ticket conversations every seven seconds while open.

The bell icon is now an in-app notification center. It receives a welcome notice on registration and support notifications when a request is created, a reply is sent, a request is forwarded, or its status changes. Notifications are stored in `server/data/notifications.json`, scoped to each account, and refreshed every seven seconds while the user is signed in. Clicking a support notification opens the related conversation and marks that notification as read. These are in-app notifications only: browser push notifications, email, SMS, and notifications while the browser is closed are not implemented. The local JSON file is not a production clinical database; do not store real patient details in this prototype. For real use, replace it with a secured database, patient-to-doctor assignments, access audit logs, secure backups, and an appropriately reviewed privacy and security design.

The authentication server does not assign patients to doctors or store device telemetry centrally.

## Included features

- Patient Dashboard and prosthetic-hand battery status (demo mode unless connected to a real telemetry bridge)
- How to Use learning path
- EMG Learning Center with a fixed MP4 path in `public/assets/WhatsApp Video 2026-10-27 at 4.00.39 AM.mp4`; no upload control
- Doctor workspace for patient cases, clinical notes, follow-up dates, progress reports, printing, and CSV export
- Developer workspace for ESP32 connection, battery, EMG sensor, motor, firmware and diagnostic events
- Support & Communication Center for patient requests, doctor replies, consent-based forwarding to the developer, status tracking, and shared conversation history
- English/Arabic, RTL/LTR, light/dark themes, responsive layout

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
    emgStatus: 'ready', // 'ready' | 'no-signal' | 'error'
    motorStatus: 'idle', // 'ready' | 'idle' | 'error'
    firmwareVersion: '1.0.0',
    errorMessage: '',
  },
}))
```

These events are frontend integration contracts. They do not implement Bluetooth, Wi-Fi, serial communication, EMG acquisition, servo control, or ESP32 firmware. Those components still need to be implemented and tested with the physical hardware.

## Image assets

The visual assets are stored in `public/assets/`. Add the fixed EMG MP4 file to this folder for video playback.
