# Current TODO

- Validate the server-side Auth0 Token Vault exchange against the target tenant and decide whether the Management API fallback should remain enabled for the final demo.
- Expand live Gmail coverage beyond the current draft-and-send flow, especially where app-managed scheduling metadata or additional live actions are still mock-only.
- Move runtime state from local JSON to Firestore collections when live persistence is needed.
- Add Cloud Scheduler jobs to advance the weekly planner automatically.
- Tighten Gemini extraction and drafting with stronger structured-output validation and evaluation coverage, reducing reliance on heuristic fallback behavior.
- Extend OCR and extraction beyond calendar screenshots to flyer/photo-style inbox artifacts.
- Wire the existing Membership Toolkit operator flow into the UI with step-by-step prompts and manual-complete actions.
- Build a newsletter editor UI with drag/drop ordering and inline section editing.
- Store and render approval comments from board reviewers.
- Add role-aware permissions for PTA board members versus the communications owner.
- Add end-to-end tests for approval boundaries, operator handoff flows, and planner break-skip behavior.
- Package deployment manifests for Cloud Run and Firestore indexes.
- Add a one-click demo reset action that restores the seeded workspace state.
