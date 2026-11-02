# MRRM – Client Document Submission and Tracking Portal

Requirements: MRRM PRD v0.3 (internal LevelShift document, not stored in this repository).
Requirement IDs such as REG-04 in code comments refer to that PRD.

| Part | Stack | Folder |
|---|---|---|
| Frontend | React 19, TypeScript, Vite, MUI | `frontend/` |
| Backend | Node 22, Express 5, TypeScript, Prisma | `backend/` |
| Database | PostgreSQL 16 (local: `127.0.0.1:5433`, database `mrrm`) | `backend/prisma/` |

## Run locally

```powershell
# 1. Database (if not running)
& "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" start -D "C:\Program Files\PostgreSQL\16\data"

# 2. Backend  → http://localhost:4000
cd backend
npm install
npx prisma migrate dev
npm run db:seed
npm run dev

# 3. Frontend → http://localhost:5173
cd frontend
npm install
npm run dev
```

`backend/.env` is not committed; copy `backend/.env.example` and fill in the values.

## Development sign-in

- Accounts (synthetic data only): `admin@mrrm.test`, `client@abc-insurance.test`.
  Passwords are `SEED_ADMIN_PASSWORD` / `SEED_CLIENT_PASSWORD` in `backend/.env`.
- With `MAIL_TRANSPORT=console`, emails (including the 6-digit sign-in code) are printed
  in the backend terminal instead of being sent.

## Built so far — sign-in module (PRD 8.1 REG)

| Screen | Route | Requirements |
|---|---|---|
| Sign in (password, then 6-digit email code) | `/login` | REG-04, REG-06, REG-10 |
| Register organization | `/register` | REG-01, REG-07, REG-09, CMP-12 |
| Verify email | `/verify-email` | REG-02, REG-08 |
| Forgot password | `/forgot-password` | REG-05 |
| Reset password | `/reset-password` | REG-05, REG-08, REG-09 |
| Registration approvals (Admin) | `/admin/registrations` | REG-03, ADM-01, ADM-08, NOT-05 |

- Lockout after 5 consecutive password/code failures, emailed to the user; a password reset clears it
- Code valid 5 minutes, 5 attempts, single use; resend invalidates earlier codes
- Email links are single use (verify 24 h, reset 60 min); a new link invalidates earlier ones
- Password policy: 12+ characters, 3 of 4 character types, no common passwords, not the last 5
- Server-side session in an HttpOnly cookie; 15-minute idle timeout with warning (REG-11);
  a password reset ends every session
- Role checks on the server for every Admin endpoint (SEC-10)
- Append-only audit log for every event above (REG-12, SEC-02)
