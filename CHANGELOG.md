# Changelog

All notable changes to this project are documented in this file.

## [0.13.1] - 2026-09-18

### Fixed

- CLI: `--start-ledger`/`--threshold`/`--extend-to`/`--nonce` silently
  became `NaN` on non-numeric input instead of failing cleanly (e.g. an
  unvalidated `--start-ledger` reaching `getEvents` as `NaN`).
- CLI: bad `--amount`/`--min-deposit`/`--max-balance` (non-integer, e.g.
  `10.5`) raised a raw `SyntaxError` from `BigInt()` instead of a
  `lumenforge: ...` message.
- CLI: malformed arguments Node's `parseArgs` itself rejects — a
  negative number as a flag's value (`--start-ledger -5`, read as
  "looks like another flag"; use `--start-ledger=-5`) or an unknown
  flag — crashed with a raw uncaught-exception stack trace instead of a
  clean error, because `parseArgs` runs at module load, before `main()`'s
  try/catch exists to catch anything.
- CLI: no way to point at an `http://` RPC endpoint (a local standalone
  network) — every connect call rejected it outright. Now auto-detected
  from the URL scheme (`allowHttp` is never inferred for `https://`).
- CLI: `factory list-vaults --with-snapshots` derived the read-only
  public key twice (harmless, but redundant); computed once now.

## [0.13.0] - 2026-09-18

### Added

- `lumenforge` CLI (`bin/lumenforge` -> `dist/cli.js`), a thin wrapper
  over the library for scripting: `vault snapshot/deposit/withdraw/
  keep-alive`, `factory snapshot/deploy-vault/list-vaults/
  keep-owner-vaults-alive`, `events list`. Signs with a `Keypair` from
  `LUMENFORGE_SECRET_KEY` (env var only — never a `--flag`, to avoid the
  secret landing in `ps` output or shell history). Uses
  `@stellar/stellar-sdk/contract`'s `KeypairSigner`; no new dependency
  (arg parsing via Node's built-in `node:util.parseArgs`). Wraps a
  subset of the library surface (the common scripting cases), not every
  method.

## [0.12.0] - 2026-09-18

### Added

- `decodeVaultEvents(events)` / `decodeFactoryEvents(events)` — batch
  versions of `decodeVaultEvent`/`decodeFactoryEvent` that decode a
  whole `getEvents` result and drop anything unrecognized, instead of
  every caller writing `events.map(decode).filter(...)` by hand.

## [0.11.0] - 2026-09-18

### Added

- `keepOwnerVaultsAlive(factory, owner, connect, options?)` — discovers
  every vault an owner has (via `iterateVaultsByOwner`) and extends each
  one's TTL, the fleet-wide version of calling `extendTtl`/`keepAlive`
  yourself once you have a list of addresses. One vault's failure
  doesn't stop the rest. Does not also extend the factory's own
  `VaultsByOwner(owner)` index entry — that's still a separate call to
  `extendVaultsByOwnerTtl`, documented as a pairing in the README.

## [0.10.0] - 2026-09-18

### Added

- `iterateVaultSnapshotsByOwner`/`collectVaultSnapshotsByOwner` — like
  `iterateVaultsByOwner`/`collectVaultsByOwner`, but resolve each address
  into its full `getVaultSnapshot` instead of leaving that to the
  caller. Takes a `connect` callback (address → `VaultReader`) since only
  the caller has the RPC/network options to connect with. Vaults are
  connected and read sequentially, not in parallel, to keep the request
  rate against the RPC endpoint predictable.

## [0.9.0] - 2026-09-18

### Added

- `getVaultSnapshot(vault)` / `getFactorySnapshot(factory)` — read every
  field of a vault or factory in one `Promise.all` batch instead of
  sequencing `balance()`/`owner()`/`token()`/etc. individually. Useful
  for a dashboard or explorer that wants a vault's/factory's full state
  in one shot. Rejects if any individual read would (e.g.
  `NotInitialized`).

## [0.8.0] - 2026-09-18

### Added

- `decodeVaultEvent(event)` / `decodeFactoryEvent(event)` — decode a raw
  contract event (matching `rpc.Api.EventResponse`'s `{ topic, value }`
  shape) into a typed `VaultEvent`/`FactoryEvent` union covering every
  event either contract publishes (`deposit`, `withdraw`, `paused`,
  `resumed`, `owner_proposed`, `owner_proposal_cancelled`,
  `owner_transferred`, `min_deposit_updated`, `max_balance_updated`,
  `rescued`, `vault_deployed`). Returns `undefined` for anything that
  isn't a recognized event, rather than throwing — including the SEP-41
  token's own `transfer` event, which appears alongside
  `deposit`/`withdraw`/`rescue`. The exact wire shape (Map-format data
  even for a single field, empty-map-not-void for zero data fields,
  `Void`-in-map for `Option::None`) was verified against real event XDR
  dumped from `lumenforge-contracts`' own tests, not assumed from the
  `#[contractevent]` macro source alone.

Previously flagged in 0.5.0's changelog ("the SDK doesn't decode event
bodies") as a known gap.

## [0.7.0] - 2026-09-18

### Added

- `keepAlive(targets, options?)`, `extendTtl(target, options?)`, and
  `extendVaultsByOwnerTtl(factory, owner, options?)` — an off-chain
  "keeper" for the TTL-extension mechanism both contracts already
  expose. Neither contract can self-trigger a renewal, so this is meant
  to be run from a cron job against every vault/factory that needs to
  stay alive. `keepAlive` isolates one target's failure from the rest so
  a scheduled run can retry just what failed. Addresses Known Limitation
  #1 in `lumenforge-contracts`' `docs/security.md` ("no TTL/rent
  *policy*, mechanism exists") — no contract-side change, since the
  mechanism (`extend_ttl`/`extend_vaults_by_owner_ttl`) was already
  there.

## [0.6.0] - 2026-09-18

### Added

- `FACTORY_ERROR_TYPES` entry for code 4 (`TooManyVaultsForOwner`),
  mirroring the new per-owner vault cap on `lumen_vault_factory`
  v0.3.2's `deploy_vault` (`MAX_VAULTS_PER_OWNER`, 100).

### Fixed

- `VAULT_ERROR_TYPES[5]` (`NoPendingOwner`)'s message said "there is no
  ownership transfer to accept", but the code is now also returned by
  `cancel_pending_owner` — reworded to cover both.

### Changed

- Regenerated `test/fixtures/lumen_vault_factory.wasm` against
  `lumen_vault_factory` v0.3.2.

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
