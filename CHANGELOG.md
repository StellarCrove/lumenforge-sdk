# Changelog

All notable changes to this project are documented in this file.

## [0.5.0] - 2026-09-07

### Added

- `deployVaultViaFactory(factory, args, options?)` — deploy a vault
  *through the factory* (so it lands in the on-chain per-owner index),
  with salt derivation handled: `{ salt: Buffer }`, `{ salt: { nonce } }`
  (deterministic via `ownerNonceSalt`), or omit for a random salt.
  Rejects a wrong-length explicit salt. Complements `deployVault`, which
  deploys a standalone instance.
- `VaultMethods.cancel_pending_owner()` — mirrors the new contract method
  (`lumen_vault` v0.4.0): the owner withdraws a `propose_owner` proposal
  before it's accepted.

### Changed

- Regenerated `test/fixtures/lumen_vault.wasm` against `lumen_vault`
  v0.4.0 (`cancel_pending_owner` + `new_balance` in `Deposit`/`Withdraw`
  events — the SDK doesn't decode event bodies, so no type change beyond
  the new method).

## [0.4.0] - 2026-09-06

### Added

- `FactoryMethods.vaults_by_owner_count({ owner })` — mirrors the new
  `lumen_vault_factory` read method (contracts v0.3.1). Returns an
  owner's vault total.
- `FACTORY_ERROR_TYPES` entry for code 3 (`CountOverflow`).
- `salt.test.ts` covers rejection of a fractional / negative / unsafe
  `nonce`; `factoryClient.test.ts` covers the new count-driven iteration
  path (exact-count stop, last-page clamp, zero count, and termination
  when a contract under-reports its count).

### Changed

- `iterateVaultsByOwner` / `collectVaultsByOwner`: when the reader
  exposes `vaults_by_owner_count`, they now read the total once and
  iterate to exactly that many — no short-page probe, `maxPages`
  unused. Readers without it keep the previous short-page + `maxPages`
  behaviour. Existing callers passing a real `connectFactory` client
  get the deterministic path automatically.
- `iterateVaultsByOwner` now rejects a non-integer `pageSize` or
  `maxPages` (previously only `pageSize <= 0` was checked).
- `ownerNonceSalt` throws on a fractional, negative, or unsafe-integer
  `nonce` instead of hashing a value the caller can't reproduce.
- Regenerated `test/fixtures/*.wasm` against `lumenforge-contracts`
  v0.3.1 / `lumen_vault` v0.3.3.

## [0.3.2] - 2026-08-10

### Added

- `iterateVaultsByOwner`/`collectVaultsByOwner`: page through all of an
  owner's vaults without hand-writing the offset loop. Both are
  guaranteed to terminate — they stop at the first short page, and throw
  (never hang) if `maxPages` (default 1000) is exceeded without that
  happening, e.g. against a contract that always returns full pages.
- `factoryClient.test.ts` covers empty/short/multi-page pagination, lazy
  early-exit from the generator (verifies later pages aren't fetched
  after a `break`), and a runaway-loop test that asserts the maxPages
  guard fires within 1s rather than hanging.

### Changed

- Regenerated `test/fixtures/*.wasm` against `lumenforge-contracts`
  v0.3.2 (`lumen_vault::token()` now returns a `Result`, matching
  `owner()` — no SDK-side type change needed, `VaultMethods.token`
  already declared this shape).

## [0.3.1] - 2026-08-10

### Fixed

- `VAULT_ERROR_TYPES` was missing entries for error codes 7-10
  (`BelowMinimumDeposit`, `ExceedsMaxBalance`, `CannotRescueVaultToken`,
  `InvalidConfiguration`) — those calls would have thrown a raw host
  error instead of a readable message. `FACTORY_ERROR_TYPES` was
  similarly missing code 2 (`NoVaultsForOwner`).
- `spec.test.ts` now asserts `VAULT_ERROR_TYPES`/`FACTORY_ERROR_TYPES`
  cover *exactly* the error codes the compiled contract declares (no
  missing, no stale extras), so this class of gap fails CI going
  forward instead of only surfacing at runtime.

### Changed

- **Breaking**: `FactoryMethods.vaults_by_owner` now takes
  `{ owner, offset, limit }`, matching `lumenforge-contracts`
  v0.3.0's paginated `vaults_by_owner`.

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
