---
description: Run lint, tests, and fallow audit on diff.
---

Run project checks sequentially:

1. `npm run lint`
2. `npm test`
3. `npm run check:fallow`

Report failures with file:line. Do not commit if any gate fails.
