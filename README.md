# CapiLAR – Backend

REST API for **CapiLAR**, a web and mobile platform for the operational and technical management of hair salons and professional stylists.

Final project of the *Tecnicatura Universitaria en Desarrollo Web* – Facultad de Informática, Universidad Nacional del Comahue (2026).

**Team: LAR Developers**

- Crespillo, Andrea
- Navarrete, Ramiro Rafael
- Parra Sanhueza, Linda Cristal

---

## About the project

Salons usually lack traceability of chemical treatments, accurate cost control of supplies, flexible recurring appointments, and objective hair diagnosis. CapiLAR addresses these problems with the following modules:

| Module | Description |
|---|---|
| **Scheduling & Appointments** | Availability based on service duration and professional schedules, single and recurring appointments, WhatsApp reminders to clients and a daily email agenda for professionals. |
| **Technical Records & Treatment History** | Digital record of each treatment: colorimetry formulas, oxidant volumes, pose times, diagnostics and an evolutionary photo log. |
| **Inventory Management** | Automatic stock deduction from the technical record, QR-based stock in/out, suppliers and delivery notes, low-stock alerts. |
| **AI Hair Diagnosis Engine** | Assessment of damage level, porosity and previous chemical work to recommend services, home-care products and incompatibility alerts. |

The project is developed with real hair professionals as test users, who provide feedback on requirements and screens.

## Tech stack

| Layer | Technology |
|---|---|
| Runtime / language | Node.js, TypeScript |
| Framework | NestJS |
| ORM | Prisma |
| Database | MySQL 8 |
| Testing | Jest |

## Repositories

CapiLAR is split into separate repositories:

- **Backend** (this repository): NestJS + Prisma + MySQL
- **Frontend**: Vite + React + Tailwind CSS
- **Mobile**: React Native + Expo

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) LTS (20.x or higher) and npm
- MySQL 8 (installed locally or running in Docker)
- Git

### Installation

```bash
git clone <repository-url>
cd <repository-folder>
npm install
```

### Environment variables

Create a `.env` file in the project root (it is git-ignored and must never be committed):

```env
DATABASE_URL="mysql://root:password@localhost:3306/capilar_db?allowPublicKeyRetrieval=true"
JWT_SECRET="a-long-random-string"
JWT_EXPIRES_IN="1d"
```

See `.env.example` for the full list of variables. `allowPublicKeyRetrieval=true` is required so the MariaDB driver adapter can authenticate against MySQL 8 without SSL.

### Database

Once the Prisma schema is set up, apply the migrations with:

```bash
npx prisma migrate dev
```

Create the first admin account (uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`; skipped if that email already exists):

```bash
npx prisma db seed
```

To browse the data locally:

```bash
npx prisma studio
```

### Running the app

```bash
# development (watch mode)
npm run start:dev

# production build
npm run build
npm run start:prod
```

The API runs on `http://localhost:3000` by default.

### Tests

```bash
# unit tests
npm run test

# end-to-end tests
npm run test:e2e
```

## External APIs (TP3)

The apps never call these APIs directly: they go through the backend, so the keys stay on the server.

### Gemini (TP3, API 3)

AI hair diagnosis for the technical record. `POST /fichas/:id/diagnostico` (PROFESIONAL) sends the latest ANTES photo of the record to Gemini with a response schema built from the Prisma enums (`NivelCapilar`, `TipoDePelo`, `VolumenDePelo`) and returns a suggestion for porosity, elasticity, gray percentage, hair type and volume, plus a short note. **Nothing is saved**: the front-end preloads the form and the professional saves it with `PATCH /fichas/:id`. Any value outside its enum or range is dropped before answering.

| Variable | Value |
| --- | --- |
| `GEMINI_API_KEY` | Key from [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | Flash model with image input (default `gemini-3.6-flash`; better a fixed model than `gemini-flash-latest`, which jumps to each new Flash and is often overloaded right after launch) |
| `GEMINI_MODO` | `simulado`: fixed answer, no call to Gemini (no quota used). `real` or empty: calls Gemini |

To turn on real mode, put the key in `.env`, set `GEMINI_MODO=real` and restart the server. The free tier has a per-minute limit (answered as 503) and Google may use the data to improve its products: use photos without faces or personal data.

Errors: 400 if the record has no ANTES photo, 403 if it belongs to another professional, 400 if it is closed, 503 if Gemini is busy (its 429 or 503), 502 if it can't analyze the photo, 504 after 30 s.

## Project structure

```
src/        Application source code (NestJS modules)
test/       End-to-end tests
prisma/     Prisma schema and migrations
```

## Git workflow

- `main`: stable, deliverable versions. Protected: changes only arrive through a Pull Request.
- `develop`: day-to-day integration branch. Default branch of the repository.
- Feature branches are created from `develop`, one per Linear issue, using the branch name suggested by Linear (e.g. `username/pwa-165-implement-authentication`).
- Pull Requests target `develop`. Include `Closes PWA-XXX` in the description so the Linear issue is closed automatically on merge.
- When a set of features is ready to be delivered, `develop` is merged into `main` through a Pull Request.

### Commit convention

Commits are written in English following [Conventional Commits](https://www.conventionalcommits.org):

```
feat: add user registration endpoint
fix: validate appointment overlap
chore: update dependencies
docs: update README
```

## Project management

Tasks are organized in [Linear](https://linear.app) (team **PWA LAR**, project **CapiLAR**) as milestones (epics) with issues and checklists:

1. Core Setup & User Management
2. Scheduling & Appointments
3. Technical Records & Treatment History
4. Inventory Management
5. AI Hair Diagnosis Engine
6. Mobile App
7. Deployment & Environments

## Status

🚧 In development.

---

*Trabajo Final 2026 – Tecnicatura Universitaria en Desarrollo Web – Facultad de Informática – Universidad Nacional del Comahue*   