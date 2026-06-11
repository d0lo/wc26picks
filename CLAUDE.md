# WC26 Picks — Development Process

## Workflow

Every feature follows two feedback loops before merging.

---

### Loop 1 — Feature Testing

1. **New feature request** → create a dedicated branch: `feature/<short-description>`
2. Implement the feature, then **commit, push, and open a PR** against `main`
3. Opening the PR automatically triggers a Firebase Hosting preview deploy — post the preview URL in chat
4. Wait for the user to test the preview
5. For each **code change request**:
   - Make the changes on the same branch
   - Commit and push — the preview URL updates automatically
   - Confirm the update in chat
   - Wait for the user to test again
6. Repeat until the user confirms the feature behaviour is acceptable

---

### Loop 2 — Code Review

1. Once the feature is accepted, run `/code-review` on the PR
2. Post findings in chat; the user decides which issues to address
3. For each **correction**:
   - Make the changes, commit, and push
   - Run `/code-review` again
   - Repeat until there are no remaining issues we both agree need fixing
4. Once the review is clean, **merge the PR into `main`**

---

### Branch Naming

`feature/<short-description>` — e.g. `feature/forgot-password`

---

### Commit Style

- One commit per logical change
- Present-tense subject line, 50 chars or fewer
- Body explains *why*, not *what*, when non-obvious

---

### General Rules

- Never push directly to `main`
- Never merge without completing both feedback loops
- Keep PRs focused on a single feature
- The preview URL should be confirmed working before starting Loop 2
