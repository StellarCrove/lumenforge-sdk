# Contributing

## Setup

```bash
npm install
npm run build
npm test
```

## Workflow

1. Fork and branch from `main`.
2. Keep PRs scoped to one client-facing change.
3. Add/update tests in `src/*.test.ts` for behavior changes.
4. Run `npm run build` and `npm test` before opening a PR.
5. If you change the wire format assumptions (contract ID length, network
   passphrase, etc.), cross-check against
   [`lumenforge-contracts`](https://github.com/StellarCrove/lumenforge-contracts).

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
