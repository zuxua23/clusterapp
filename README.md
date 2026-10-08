# Cluster App

A web app for running a residential cluster at the RW/RT level. It covers resident and house records, IPL (monthly environment fee) billing, deposits, finances, complaints, announcements, activities, and meeting notes. Access is tied to a person's role and area, so a block treasurer only sees their own block, a chairperson sees their RT, and so on.

It's an npm workspaces monorepo with a NestJS backend and a Next.js frontend.

## Stack

- **Backend:** NestJS 11, TypeScript, Prisma 5, MySQL
- **Auth:** JWT with bcrypt-hashed passwords, rate limiting on login
- **Validation:** class-validator, with error messages translated to Indonesian
- **Notifications:** in-app (polling) plus Web Push with VAPID keys
- **Scheduled jobs:** `@nestjs/schedule`
- **Exports:** ExcelJS and csv-stringify
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 3, Framer Motion
- **Frontend extras:** Lucide icons, SweetAlert2, jsPDF, pdf-lib
- **PWA:** manifest and service worker in `frontend/public`

## Features

- **Login and sessions.** Users sign in with a username (their phone number by default). Sessions use JWT, log out automatically after 15 idle minutes, and have a working "remember me". Some accounts are forced to change their password on first login.
- **Editable permissions.** The role, permission and scope matrix (`ALL`, `AREA`, `OWN`) lives in the database. An admin can change it from the UI and it takes effect without a redeploy.
- **Residents and houses.** Full CRUD, house block validation (format like `E7/15`), and a self-registration flow that committee members approve.
- **IPL billing.** Monthly invoices, payments with proof of transfer, and deposits from each RT up to the RW.
- **Finance.** Cash transactions with receipt uploads and CSV/XLSX export.
- **Complaints.** Residents report problems and the committee responds.
- **Announcements, activities and meeting notes.**
- **Notifications.** A bell in the header plus Web Push.
- **Audit log** of user activity.
- **One dashboard** at `/dashboard` for every role, mobile-friendly, plus a public landing page.

Roles: `ADMIN`, `KETUA_RW`, `BENDAHARA_RW`, `SEKRE_RW`, `KETUA_RT`, `BENDAHARA_RT`, `SEKRE_RT`, `WARGA`. The starting permission matrix came from interviews with an RT chairperson and an RW treasurer, and it's in `backend/prisma/rbac-data.ts`.

## Project layout

```
clusterapp/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   ├── rbac-data.ts      # initial roles and permissions
│   │   └── seed.ts
│   ├── src/
│   │   ├── auth/ rbac/ warga/ ipl/ setoran/ keuangan/
│   │   ├── pengaduan/ pengumuman/ kegiatan/ catatan-rapat/
│   │   ├── notifikasi/ push/ audit/ dashboard/
│   │   └── common/ prisma/
│   └── uploads/
├── frontend/
│   ├── public/               # assets, manifest.json, sw.js
│   └── src/
│       ├── app/              # login, register, landingpage, dashboard/*
│       ├── components/
│       └── lib/              # API client, session, validators
├── CHANGELOG.md
├── UAT-CHECKLIST.md
└── package.json              # workspaces
```

## Getting started

You'll need Node.js 20 or newer, npm, and MySQL 8 or newer.

Clone and install:

```bash
git clone https://github.com/zuxua23/clusterapp.git
cd clusterapp
npm install
```

Create `backend/.env`:

```env
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/DB_NAME"
JWT_SECRET="<long-random-string>"
JWT_EXPIRES_IN=1d
PORT=4000

# Web Push (optional, push is disabled if these are missing)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT="mailto:you@example.com"

# Production only: extra allowed frontend origins, comma separated
CORS_ORIGINS=
```

You can generate VAPID keys with `npx web-push generate-vapid-keys`.

The frontend defaults to `http://localhost:4000` for the API. To change it, create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Run the migrations and seed the database:

```bash
cd backend
npx prisma migrate dev
npm run seed
```

The seed creates roles and permissions, an admin account, RW/RT committee accounts, and some sample residents. The sample credentials are printed to the console when it finishes. Change every seeded password before you deploy anything.

Start both apps in separate terminals:

```bash
# backend, http://localhost:4000
cd backend && npm run start:dev

# frontend, http://localhost:3000
cd frontend && npm run dev
```

## Scripts

Backend (`backend/`):

| Script | What it does |
|---|---|
| `npm run start:dev` | Dev server with watch mode |
| `npm run build`, `npm run start:prod` | Production build and run |
| `npm run seed` | Seed the database |
| `npm run lint`, `npm run format` | ESLint and Prettier |
| `npm test`, `npm run test:e2e` | Unit and e2e tests |

Frontend (`frontend/`):

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build`, `npm start` | Production build and run |
| `npm run lint` | ESLint |

## Security notes

- Passwords are hashed with bcrypt and the login endpoint is rate limited.
- The global `ValidationPipe` uses `whitelist` and `forbidNonWhitelisted`, so a request with unexpected fields is rejected. This blocks mass assignment, for example someone sneaking a `roleId` into a request body.
- CORS: in development `localhost` is allowed automatically. In production only `CORS_ORIGINS` and `*.vercel.app` get through.
- Uploaded files are stored in the database (`tb_File`). Financial proofs and meeting notes can only be fetched through their own module endpoints, which check login and area.
- The hardening plan is in `RENCANA-KEAMANAN-CYBER.md`.

## More docs

These are written in Indonesian:

- [`CHANGELOG.md`](CHANGELOG.md) for what changed and when
- [`UAT-CHECKLIST.md`](UAT-CHECKLIST.md) for acceptance testing per role
- [`RENCANA-PERBAIKAN-SISTEM.md`](RENCANA-PERBAIKAN-SISTEM.md) for the system improvement plan
- [`RENCANA-KEAMANAN-CYBER.md`](RENCANA-KEAMANAN-CYBER.md) for the security plan
