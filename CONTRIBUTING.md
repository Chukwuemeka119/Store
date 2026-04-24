# Contributing to StockSavvy POS

We welcome contributions! Follow these steps:

1. **Fork the repository** and clone your fork.
2. **Install dev dependencies**: `npm install` (installs ESLint).
3. **Run lint**: `npm run lint`. Fix any warnings before committing.
4. **Make changes in the `src/` folder** (if the codebase has been modularized). Otherwise edit `script.js`.
5. **Write tests** (Jest for unit tests, Cypress for end‑to‑end) and ensure `npm test` passes.
6. **Commit** with a clear message ("Add inventory edit UI", "Fix low‑stock badge").
7. **Push** to your fork and open a PR.

### Code Style
- Use single‑quotes, 2‑space indentation.
- Prefer `const`/`let` over `var`.
- Keep functions small and pure where possible.
- Run `eslint .` before pushing.

### Testing
- Unit tests live in `tests/`.
- E2E tests live in `cypress/`.
- CI (GitHub Actions) runs lint and tests on every PR.

### Release Process
- Merge to `main` triggers a GitHub Action that builds and deploys the static site.
- Tag releases with `vX.Y.Z`.

Thank you for helping make StockSavvy better!