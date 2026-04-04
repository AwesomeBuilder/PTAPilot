# PTA Pilot

PTA Pilot is a hackathon MVP for an AI PTA communications agent. It demonstrates a weekly newsletter workflow with a clean dashboard, explicit human approvals, Auth0-based delegated access, Gmail and Membership Toolkit adapters, mock WhatsApp/iMessage feeds, and Gemini-ready extraction/planning hooks.

The repo is optimized for a believable demo first:

- Mock mode works end to end out of the box.
- Auth0 login can now generate a real Google/Gmail login URL with Gmail `connection_scope` values.
- Backend auth status can inspect Gmail tokensets through the Auth0 Management API when configured and now performs a live Gmail API reachability probe.
- Gmail live mode now syncs recent threads, fetches reminder-thread replies, creates drafts, and sends Gmail messages behind approval when the delegated Gmail API path is actually reachable.
- Membership Toolkit is abstracted behind an adapter interface and fully functional in mock mode.
- Every send, publish, or schedule action requires explicit approval.

See [technical-architecture.md](docs/technical-architecture.md) for the architecture summary, module map, folder structure, and full env var list.

## Stack

- Frontend: Next.js 16 + TypeScript + shadcn UI with preset `--preset b3kvHNdi7`
- Backend: Node.js + TypeScript + Express, ready for Google Cloud Run
- Shared domain package: typed models, zod schemas, seed data
- Database direction: Firestore in live mode, local JSON-backed runtime state in demo mode
- Auth: Auth0 Next.js SDK + Token Vault scaffolding
- LLM: Gemini via Vertex AI using `@google/genai`
- Scheduling direction: planner state machine now, Cloud Scheduler next

## Repo Layout

```text
apps/
  api/        Cloud Run backend, adapters, planner, approvals, prompt files
  web/        Next.js dashboard, Auth0 session handling, proxy to API
packages/
  shared/     shared types, zod schemas, seeded demo data
docs/
  technical-architecture.md
Agent.md
TODO.md
```

## Local Development

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy env values from [`.env.example`](.env.example):
   - put the web section into `apps/web/.env.local`
   - put the API section into `apps/api/.env`

3. Start both apps:

   ```bash
   pnpm dev
   ```

4. Open [http://localhost:3000](http://localhost:3000)

### Verified commands

These commands were run successfully on March 24, 2026:

```bash
pnpm typecheck
pnpm --filter web lint
pnpm --filter web build
pnpm --filter api build
pnpm dev
```

The dev smoke test returned `200 OK` from `http://localhost:3000` and a healthy JSON response from `http://localhost:8081/health`.

## What Works Now

- Dashboard shell with:
  - left workflow rail
  - center workspace views
  - right approvals and audit rail
- Setup view for:
  - Auth0 account email
  - seeded contacts
  - seeded school breaks
  - mock/live/manual integration mode toggles
- Inbox view for:
  - seeded Gmail reminder thread
  - mock WhatsApp/iMessage composer
  - ingestion trigger
  - extracted structured content preview
- Newsletter view for:
  - duplicate-last-newsletter flow
  - section ordering preview
  - source badges
  - flyer recommendation cards
- Actions Review view for:
  - Monday reminder
  - Wednesday board draft email
  - Thursday teacher release
  - Sunday parent scheduling
  - approve / reject / edit actions
- Setup status for:
  - live Gmail connect / reconnect URL
  - granted versus missing Gmail scopes
  - Auth0 Management API readiness for tokenset inspection
  - live Gmail action path and Gmail API probe status
- Live Gmail flow when the delegated Gmail API path is available:
  - sync recent Gmail threads into the inbox on bootstrap / ingest
  - fetch replies from the PTA reminder thread
  - create or update a Gmail draft when saving Gmail-backed approval edits
  - send a Gmail message only after explicit approval
- Audit log view and right-rail action history
- Backend routes with JSON state persistence at `apps/api/data/runtime-state.json`

## Auth0 and Token Vault Setup

Use the official Auth0 docs when wiring the live flow because Token Vault is still evolving. The current repo now has two distinct Gmail paths:

1. Preferred future path: real Auth0 Token Vault access-token exchange.
2. Current demo path: Auth0 Management API identity-provider token fallback when the Auth0 user profile exposes a Google access token.

The current scaffold assumes:

1. Create or reuse an Auth0 Regular Web Application.
2. Set Allowed Callback URLs to `http://localhost:3000/auth/callback`.
3. Set Allowed Logout URLs to `http://localhost:3000`.
4. Put the tenant domain, client ID, client secret, app base URL, and secret into both app env files as needed.
5. Enable a Google or Google Workspace connection with the Gmail scopes you need for the demo.
6. Configure Auth0 Token Vault for that connection.
7. Create a Machine to Machine application for the Auth0 Management API and grant at least `read:federated_connections_tokensets`.
8. Put the Management API client ID and secret into `apps/api/.env`.
9. Use the Setup screen button to log in or reconnect Gmail with the requested `connection_scope` values.
10. Enable the Gmail API on the Google Cloud project behind the Auth0 Google connection.
11. If you want to move off the fallback path, add a real Auth0 audience / subject-token flow and finish the Token Vault exchange in `apps/api/src/modules/auth/token-vault.ts`.

Notes:

- The live Gmail adapter is intentionally server-only.
- The app does not store long-lived Google refresh tokens itself.
- The current dashboard can run without Auth0 env vars; it falls back to guest/demo mode cleanly.
- If the Management API credentials are present, the Setup screen will show real granted/missing Gmail scopes for the logged-in Auth0 user when the tenant exposes tokensets.
- This repo does not yet perform a verified Token Vault token exchange. The live Gmail action path currently uses the Auth0 Management API to inspect the user identity and reuses the exposed Google access token when available.
- The Setup screen now marks Gmail as not live-ready if Google rejects the delegated token, including the common case where `gmail.googleapis.com` is disabled on the Google project behind the Auth0 connection.
- Saving the Wednesday board-review approval in live mode creates or updates a Gmail draft. Approving that action sends it.
- Live Gmail send is intentionally limited to the board-review email right now because the repo does not have a real PTA member recipient list. The Monday member reminder remains mock-only unless you add explicit recipients.

## Gemini / Vertex Setup

Gemini is optional for the mock demo and required for the live LLM story.

1. Set `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` in `apps/api/.env`.
2. Keep `VERTEX_MODEL=gemini-3.1-pro-preview` unless you intentionally swap models.
3. Add Firestore env vars if you want live persistence instead of demo JSON state.

If Vertex is not configured, PTA Pilot falls back to deterministic mock extraction and draft generation so the demo still works.

## Human Approval Rules

These actions must never happen silently:

- sending the Monday reminder email
- sending the Wednesday board review email
- publishing the Thursday teacher version
- scheduling the Sunday parent newsletter

The backend models each of those as an approval item and the UI keeps them visible on the right rail and on the Actions Review screen.

## Important Product Behaviors

- PTA Pilot should ask for missing information before high-impact actions.
- After approval, execution should be smooth and not ask for redundant confirmations.
- Gmail schedule-send is currently modeled as an app-side scheduled action. The official Gmail docs expose create-draft and send flows; I infer there is no native schedule-send endpoint, so the app intentionally emulates scheduling.
- Gmail live send is explicit and approval-gated. Draft creation is allowed before approval, but send only happens from the approval step.

## References

- [Authorized to Act hackathon rules](https://authorizedtoact.devpost.com/rules)
- [Auth0 for AI Agents](https://dev.auth0.com/docs/get-started/auth0-for-ai-agents)
- [Auth0 Token Vault](https://dev.auth0.com/docs/secure/tokens/token-vault)
- [Auth0 Next.js quickstart](https://dev.auth0.com/docs/quickstart/webapp/nextjs)
- [Gmail API send guide](https://developers.google.com/workspace/gmail/api/guides/sending)
- [Gmail drafts.create reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create)
- [Gmail drafts.update reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/update)
- [Gmail drafts.send reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/send)
- [Gmail messages.send reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Gmail threads.list reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/list)
- [Gmail threads.get reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get)
- [Google Vertex AI Node.js overview](https://cloud.google.com/vertex-ai/generative-ai/docs/reference/nodejs/latest/overview)
