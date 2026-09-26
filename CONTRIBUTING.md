# Contributing to Copy as Context

Thanks for contributing.

## Development setup

Use a current Node.js LTS release and npm:

```bash
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm run compile
npm test
npm run build
```

## Git workflow

`main` is the stable, releasable branch. Make each logical change in a short-lived branch created from the latest `main`.

```bash
git switch main
git pull
git switch -c feature/short-description
```

Use a descriptive prefix:

- `feature/...` for new functionality
- `fix/...` for bug fixes
- `docs/...` for documentation-only changes
- `chore/...` for maintenance

Commit focused changes, push the branch, and open a pull request into `main`. Include a concise description of the change and the checks you ran. Merge only after the relevant checks pass, then delete the branch.

## Sensitive data

Never commit API keys, tokens, personal data, or local configuration. Local environment files such as `.env` and `.env.local` are ignored. If configuration is needed, add a tracked `.env.example` containing variable names and safe placeholder values only.

## Chrome accessibility fixtures

Chrome-specific AX/CDP data belongs in `src/adapters/chrome/`; only its normalized result may enter `src/core/`. The capture adapter performs one `attach → Accessibility.getFullAXTree → detach` sequence per request and must detach in every outcome after a successful attach.

When adding a raw AX fixture, use a small, hand-reviewed, de-identified sample. Never retain page URLs with query parameters, account names, personal data, or secrets. Pair it with the expected browser-agnostic semantic tree and add regression coverage. Live Chrome checks are manual smoke tests; unit tests must mock the debugger client and remain deterministic in CI.
