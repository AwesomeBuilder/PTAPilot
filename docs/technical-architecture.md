# Technical Architecture Summary

## Purpose

PTA Pilot is a demo-first web app for a PTA VP of Communications. It models a weekly communications workflow across Gmail, Membership Toolkit, board review, teacher release, parent scheduling, and optional flyer generation, while preserving a strict approval gate for risky actions.

## Architecture Decisions

- Monorepo with clear runtime boundaries.
- Next.js frontend for a fast demo UI and Auth0 session handling.
- Separate Node/Express backend for Google Cloud Run deployment and server-only token handling.
- Shared package for domain models, zod schemas, and seed data to avoid UI/API drift.
- Firestore chosen as the long-term database, but local JSON persistence is used for the hackathon-friendly happy path.
- Mock-first adapters ensure the app is demoable even if live integrations are incomplete.

## Folder Structure

```text
PTAPilot/
  apps/
    api/
      src/
        config/
        lib/
        modules/
          ai/
          auth/
          flyer/
          inbox/
          membershipToolkit/
          newsletter/
          planner/
          demo/
      data/
    web/
      src/
        app/
        components/
        lib/
        proxy.ts
  packages/
    shared/
      src/
  docs/
    technical-architecture.md
  Agent.md
  TODO.md
```

## Runtime Model

### Frontend

- Runs in `apps/web`.
- Uses Next.js App Router.
- Proxies `/api/*` requests to the backend using `PTA_API_BASE_URL`.
- Uses Auth0 Next.js SDK when env vars are present.
- Falls back to guest/demo mode when Auth0 is not configured.

### Backend

- Runs in `apps/api`.
- Express service with typed module boundaries.
- Intended Cloud Run deployment target.
- Keeps auth, token exchange, Gmail, and AI integrations server-side.
- Persists runtime demo state into `apps/api/data/runtime-state.json`.

### Shared package

- Runs in `packages/shared`.
- Exports domain types, zod schemas, and seed data.
- Keeps frontend and backend aligned on the same state model.

## Module Inventory

### `auth/`

- Auth0 Token Vault status helper
- secure token exchange placeholder
- backend auth status route
- frontend Auth0 session wrapper

### `inbox/`

- Gmail adapter interface and mock/live split
- mock WhatsApp and iMessage inboxes
- ingestion trigger for structured content extraction

### `newsletter/`

- newsletter data model
- duplicate-last-newsletter behavior
- placement rules for urgent and time-sensitive content

### `membershipToolkit/`

- adapter interface
- mock adapter
- browser/manual placeholder adapter

### `flyer/`

- flyer-needed decision helper
- flyer brief generation
- mock flyer image generation

### `planner/`

- weekly workflow state machine
- Sunday school-break skip logic
- approval-oriented scheduling logic

### `ai/`

- prompt templates stored as files
- Gemini service wrapper
- heuristic fallback when Vertex is not configured

### `demo/`

- bootstrap route
- setup updates
- mock message creation
- ingestion
- duplicate newsletter
- approval edit / approve / reject
- audit log changes

## Data Flow

1. Setup defines contacts, school breaks, and integration modes.
2. Inbox collects Gmail replies and mock messages.
3. AI extraction creates structured content items.
4. Newsletter rules place urgent items first and time-sensitive items next.
5. Flyer logic proposes image treatment for visual/action-heavy items.
6. Approval actions are drafted for send/publish/schedule operations.
7. User approves or rejects.
8. Backend logs every suggestion, approval, and execution event.

## Persistence Strategy

### Current

- Seed data originates in `packages/shared/src/demo-data.ts`.
- First backend run writes state into `apps/api/data/runtime-state.json`.
- This keeps the demo environment portable and easy to reset.

### Planned live mode

- Firestore for workflow state, approvals, contacts, school breaks, and logs.
- Cloud Scheduler for weekly execution cadence.
- Membership Toolkit live/manual adapter backing.

## Security Model

- Auth0 session and login live in the web app.
- The Setup screen can generate a real Auth0 Google login URL with Gmail `connection_scope` values.
- Third-party delegated access belongs server-side only.
- Token Vault access is designed to happen through secure token exchange from the backend.
- The backend can inspect Auth0 federated-connection tokensets through the Management API to verify whether Gmail access is connected and scoped correctly.
- Long-lived third-party refresh tokens are not stored by PTA Pilot when Token Vault covers that responsibility.
- High-impact actions require explicit approval.

## Environment Variables

### Web (`apps/web/.env.local`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_BASE_URL` | Yes for Auth0 | Base URL for the Next.js app |
| `PTA_API_BASE_URL` | Yes | Backend URL used by Next.js rewrites |
| `AUTH0_DOMAIN` | Optional for demo, required for live auth | Auth0 tenant domain |
| `AUTH0_CLIENT_ID` | Optional for demo, required for live auth | Auth0 web app client ID |
| `AUTH0_CLIENT_SECRET` | Optional for demo, required for live auth | Auth0 web app client secret |
| `AUTH0_SECRET` | Optional for demo, required for live auth | Cookie/session encryption secret |
| `AUTH0_AUDIENCE` | Optional | API audience when using Auth0-protected APIs |
| `AUTH0_SCOPE` | Optional | Requested scopes for login |
| `AUTH0_TOKEN_VAULT_CONNECTION` | Optional | Connection label used for UI status and future live Gmail flows |
| `AUTH0_GMAIL_CONNECTION` | Optional | Auth0 Google connection name for the Gmail connect button |
| `AUTH0_GMAIL_SCOPES` | Optional | Comma-separated Gmail scopes passed as `connection_scope` |

### API (`apps/api/.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | API port, default `8080` |
| `APP_BASE_URL` | No | API base URL, default `http://localhost:8080` |
| `CORS_ORIGIN` | No | Allowed frontend origin list |
| `AUTH0_DOMAIN` | Optional for mock mode | Auth0 tenant domain |
| `AUTH0_CLIENT_ID` | Optional for mock mode | Auth0 client ID |
| `AUTH0_CLIENT_SECRET` | Optional for mock mode | Auth0 client secret |
| `AUTH0_SECRET` | Optional for mock mode | Shared Auth0 secret |
| `AUTH0_APP_BASE_URL` | Optional for mock mode | Frontend app base URL used in Auth0 flows |
| `AUTH0_AUDIENCE` | Optional | Auth0 API audience |
| `AUTH0_MANAGEMENT_CLIENT_ID` | Optional | Auth0 Management API machine-to-machine client ID |
| `AUTH0_MANAGEMENT_CLIENT_SECRET` | Optional | Auth0 Management API machine-to-machine client secret |
| `AUTH0_MANAGEMENT_API_SCOPE` | No | Scope list for Management API status checks |
| `AUTH0_TOKEN_VAULT_CONNECTION` | Optional | Token Vault connection identifier |
| `AUTH0_TOKEN_VAULT_PROVIDER` | No | External provider label, default `google-oauth2` |
| `AUTH0_TOKEN_VAULT_ACCOUNT_ID` | Optional | Future server-side connected-account exchange target |
| `AUTH0_GMAIL_CONNECTION` | No | Expected Gmail connection name, default `google-oauth2` |
| `AUTH0_GMAIL_SCOPES` | No | Required Gmail scopes for connection verification |
| `GOOGLE_CLOUD_PROJECT` | Optional for mock mode | Vertex / Firestore project |
| `GOOGLE_CLOUD_LOCATION` | No | Vertex location, default `us-central1` |
| `VERTEX_MODEL` | No | Gemini model name, default `gemini-3.1-pro-preview` |
| `FIREBASE_PROJECT_ID` | Optional | Firestore project ID |
| `FIREBASE_CLIENT_EMAIL` | Optional | Firestore service account email |
| `FIREBASE_PRIVATE_KEY` | Optional | Firestore service account private key |
| `MEMBERSHIP_TOOLKIT_MODE` | No | `mock`, `manual`, or `live` |
| `FLYER_MODE` | No | `mock` or `live` |
| `DEMO_RUNTIME_STATE_PATH` | Optional | Override JSON state path |

## Approval Boundaries

The following actions are modeled as risky and require approval:

- Monday reminder email send
- Wednesday board review send
- Thursday teacher version publish
- Sunday parent version scheduling

The UI exposes these in both the Actions Review view and the right-side approval rail.

## Deployment Shape

### Local

- `pnpm dev`
- Next.js on port `3000`
- API on port `8080`

### Cloud

- `apps/api` to Cloud Run
- `apps/web` to Vercel, Cloud Run, or another Node-capable frontend host
- Firestore for live persistence
- Cloud Scheduler for weekly planner transitions

## Current Gaps

- Auth0 Token Vault exchange helper is scaffolded but not fully wired.
- Gmail live adapter is not yet issuing real Gmail API calls.
- Membership Toolkit live mode remains placeholder/manual.
- Firestore is optional and not yet the primary persistence layer.
- Scheduler jobs are not deployed yet.
