# Changelog

All notable changes to this project are documented in this file.

## [0.3.0] - 2026-08-10

### Added

- `deployVault`: deploys a new `lumen_vault` directly (wrapping
  `contract.Client.deploy`), for integrators not going through the
  factory.
- `token()`, `min_deposit()`, `max_balance()`, `set_min_deposit()`,
  `set_max_balance()`, `rescue()` on `VaultMethods`, matching
  `lumen_vault`'s real SEP-41 token custody.
- `deploy_vault`'s `FactoryMethods` signature now includes `token`,
  `min_deposit`, `max_balance` alongside `owner`/`salt`.
- `spec.test.ts` now also asserts the vault's constructor and the
  factory's `deploy_vault` have the exact param names/order this SDK's
  types declare, and checks all 9 vault error codes (previously 6).

### Changed

- **Breaking**: `VaultMethods`/`DeployVaultArgs`/`FactoryMethods.deploy_vault`
  all changed shape to match `lumenforge-contracts` v0.3.0's constructor
  and `deploy_vault` signature changes (both now take `token`,
  `min_deposit`, `max_balance`).

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
