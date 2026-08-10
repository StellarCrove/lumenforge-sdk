# Changelog

All notable changes to this project are documented in this file.

## [0.2.0] - 2026-08-10

### Added

- `connectFactory`/`FactoryClient` for `lumen_vault_factory`
  (`deploy_vault`, `vault_count`, `vaults_by_owner`, `vault_wasm_hash`).
- `pause`, `unpause`, `propose_owner`, `accept_owner`, `pending_owner` on
  `VaultMethods`, matching the hardened `lumen_vault` contract.
- `randomSalt`/`ownerNonceSalt` helpers for factory deployment salts.
- `VAULT_ERROR_TYPES`/`FACTORY_ERROR_TYPES`, wired into `connectVault`/
  `connectFactory` automatically for readable contract error messages.
- `src/spec.test.ts`: validates `VaultMethods`/`FactoryMethods` against
  the real compiled contract spec (`test/fixtures/*.wasm`), not a mock.

### Changed

- Rebuilt on `@stellar/stellar-sdk`'s `contract.Client` (spec-driven,
  auto-decoding) instead of hand-built `TransactionBuilder`/`Contract`
  calls with manual `nativeToScVal`/`scValToNative` conversion.
- Bumped `@stellar/stellar-sdk` to 16.2.0, which requires Node ≥ 22 —
  added `.nvmrc`, `engines`, and updated CI accordingly.
- `balance()` no longer builds a transaction against a hardcoded fake
  source account; reads go through the same spec-driven client as
  writes.
- Moved to ESLint's flat config (`eslint.config.js`) with
  `typescript-eslint`.

### Removed

- Old hand-rolled `LumenVaultClient` (`src/client.ts`), replaced by
  `connectVault`.

## [0.1.0] - 2026-08-10

### Added

- `LumenVaultClient`: read `balance()`, build `deposit`/`withdraw`
  operations against a deployed `lumen_vault` Soroban contract.
- Unit tests for client construction and operation building.
- CI workflow (build + test on push/PR to `main`).
