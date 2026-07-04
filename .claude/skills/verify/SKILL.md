---
name: verify
description: Run the full verification gate — typecheck, lint, tests, and the iOS bundle export — and report pass/fail for each step. Use before committing, after multi-file changes, or when asked whether the app still builds.
---

Run these from the project root, in order, and report pass/fail for each step:

1. `npx tsc --noEmit`
2. `npx eslint . --ext .ts,.tsx`
3. `npx jest --ci`
4. `rm -rf dist && npx expo export --platform ios`

Rules:
- If a step fails, show the actual errors, fix them, and re-run that step until
  it passes (or report clearly why it can't pass).
- Don't skip later steps just because an earlier one needed fixes — the gate is
  only green when all four pass in one final state of the tree.
- Finish with a one-line summary, e.g.: `tsc ✅ · eslint ✅ · jest 43/43 ✅ · export ✅`.
