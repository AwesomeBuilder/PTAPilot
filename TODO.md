# Post-Hackathon TODO

- Finish the server-side Auth0 Token Vault access-token exchange flow for live Gmail calls.
- Complete the Gmail live adapter for thread listing, draft creation, send, and app-managed scheduling metadata.
- Move runtime state from local JSON to Firestore collections.
- Add Cloud Scheduler jobs to advance the weekly planner automatically.
- Replace heuristic extraction with fully structured Gemini prompts and evaluation tests.
- Add image attachment OCR and extraction for flyer/photo inbox items.
- Build a richer Membership Toolkit browser/manual mode with step-by-step operator prompts.
- Add newsletter drag/drop ordering and inline section editing in the UI.
- Store and render approval comments from board reviewers.
- Add role-aware permissions for PTA board members versus the communications owner.
- Add end-to-end tests for approval boundaries and planner break-skip behavior.
- Package deployment manifests for Cloud Run and Firestore indexes.
- Add a one-click demo reset button that restores the seeded workspace state.
