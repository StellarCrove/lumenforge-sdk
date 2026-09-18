# lumenforge-sdk

TypeScript client SDK for the [LumenForge Soroban
contracts](https://github.com/StellarCrove/lumenforge-contracts) on
Stellar: `lumen_vault` (a real SEP-41 token vault) and
`lumen_vault_factory`.

Built on `@stellar/stellar-sdk`'s `contract.Client` — each connect call
fetches the deployed contract's on-chain spec, so calls are validated and
results decoded automatically without hand-written XDR conversion.

## Requirements

Node.js ≥ 22 (matches `@stellar/stellar-sdk` 16's engine requirement —
see `.nvmrc`).

## Install

```bash
npm install @lumenforge/sdk
```

## Usage

### Connect to a vault

```ts
import { connectVault } from "@lumenforge/sdk";

const vault = await connectVault({
  contractId: "C...",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  publicKey: "G...",
  signTransaction, // e.g. from a wallet extension
});

const { result: balance } = await vault.balance();
const { result: token } = await vault.token();

const tx = await vault.deposit({ from: "G...", amount: 500n });
await tx.signAndSend();
```

### Deploy a new vault directly

```ts
import { deployVault } from "@lumenforge/sdk";

const deployTx = await deployVault(
  {
    owner: "G...",
    token: "C...", // the SEP-41 token this vault will custody
    min_deposit: 0n,
    max_balance: undefined, // or a bigint cap
  },
  {
    wasmHash: "<lumen_vault wasm hash, already installed on-chain>",
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    publicKey: "G...",
    signTransaction,
  },
);
const { result: vault } = await deployTx.signAndSend(); // a connected VaultClient
```

### Factory (deploy + index vaults on-chain)

```ts
import { connectFactory, randomSalt } from "@lumenforge/sdk";

const factory = await connectFactory({
  contractId: "C...",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  publicKey: "G...",
  signTransaction,
});

const tx = await factory.deploy_vault({
  owner: "G...",
  token: "C...",
  min_deposit: 0n,
  max_balance: undefined,
  salt: randomSalt(),
});
const { result: vaultAddress } = await tx.signAndSend();
```

Or let `deployVaultViaFactory` handle the salt for you:

```ts
import { deployVaultViaFactory } from "@lumenforge/sdk";

// random salt (default)
const tx = await deployVaultViaFactory(factory, {
  owner: "G...",
  token: "C...",
  min_deposit: 0n,
});

// deterministic: same (owner, nonce) → same vault address
const tx2 = await deployVaultViaFactory(
  factory,
  { owner: "G...", token: "C...", min_deposit: 0n },
  { salt: { nonce: 0 } },
);

const { result: vaultAddress } = await tx.signAndSend();
```

Use `ownerNonceSalt(owner, nonce)` (or `{ salt: { nonce } }` above)
instead of `randomSalt()` if you want a deterministic, reproducible vault
address for a given `(owner, nonce)` pair.

`vaults_by_owner` is paginated — pass `offset`/`limit` rather than
assuming an owner has few vaults:

```ts
const { result: firstPage } = await factory.vaults_by_owner({
  owner: "G...",
  offset: 0,
  limit: 20,
});
```

To walk *every* vault an owner has without hand-rolling the offset loop,
use `collectVaultsByOwner` (or `iterateVaultsByOwner` if you want to
process results as they arrive instead of waiting for the whole list):

```ts
import { collectVaultsByOwner, iterateVaultsByOwner } from "@lumenforge/sdk";

const allVaults = await collectVaultsByOwner(factory, "G...");

for await (const vault of iterateVaultsByOwner(factory, "G...", { pageSize: 50 })) {
  // process one at a time; stops fetching further pages if you `break`
}
```

Both are guaranteed to terminate. Against a factory that exposes
`vaults_by_owner_count` (any `connectFactory` client does), they read the
total once and stop at exactly that many vaults. Against an older factory
or a hand-rolled reader without it, they fall back to stopping at the
first page shorter than `pageSize`, and throw (rather than loop forever)
if `maxPages` (default 1000) is hit without that ever happening —
protection against a misbehaving contract that always returns full pages.

`factory.vaults_by_owner_count({ owner })` is also usable directly when
you just want the number.

Both only give you addresses — for "show me this owner's vaults, with
balances," use `collectVaultSnapshotsByOwner`/`iterateVaultSnapshotsByOwner`
instead, which resolve each address into a full `getVaultSnapshot`.
`connect` is up to you (typically `connectVault` with whatever RPC/network
options are already in scope) since only the caller has those:

```ts
import { collectVaultSnapshotsByOwner } from "@lumenforge/sdk";

const vaults = await collectVaultSnapshotsByOwner(factory, "G...", (address) =>
  connectVault({ contractId: address, /* same rpcUrl/networkPassphrase/... */ }),
);
// [{ address: "C...", balance: 500n, owner: "G...", paused: false, ... }, ...]
```

Vaults are connected and read one at a time, not in parallel — a page of
N vaults costs N sequential round trips, same as looping
`getVaultSnapshot` yourself. That trades speed for a predictable request
rate against the RPC endpoint; add your own concurrency on top if your
endpoint can take it.

### Keeping contracts alive (TTL)

Neither contract can renew its own storage TTL — Soroban contracts can't
self-trigger — so something off-chain has to call `extend_ttl`
periodically, or the network archives the storage once its TTL expires.
`keepAlive` is that off-chain half, meant to be run from a cron job (or
any scheduler) against every vault/factory you want to keep alive:

```ts
import { keepAlive } from "@lumenforge/sdk";

const results = await keepAlive([vault, factory]);
// [{ target: vault, status: "ok" }, { target: factory, status: "ok" }]
```

One target failing doesn't stop the others — each result is reported
independently, so a scheduled run can retry only what failed. Defaults
extend to ~30 days out once within ~1 day of expiring; override with
`{ threshold, extendTo }` (in ledgers). For a single target, or for a
factory's per-owner `VaultsByOwner` entry (which has its own, separate
TTL), use `extendTtl`/`extendVaultsByOwnerTtl` directly:

```ts
import { extendTtl, extendVaultsByOwnerTtl } from "@lumenforge/sdk";

const tx = await extendTtl(vault);
await tx.signAndSend();

const tx2 = await extendVaultsByOwnerTtl(factory, "G...");
await tx2.signAndSend(); // rejects with NoVaultsForOwner if this owner has none
```

Don't know an owner's vault addresses up front? `keepOwnerVaultsAlive`
discovers them (via `iterateVaultsByOwner`) and extends each one, same
per-target failure isolation as `keepAlive`:

```ts
import { keepOwnerVaultsAlive, extendVaultsByOwnerTtl } from "@lumenforge/sdk";

const results = await keepOwnerVaultsAlive(factory, "G...", (address) =>
  connectVault({ contractId: address, /* same rpcUrl/networkPassphrase/... */ }),
);
// [{ address: "C...", status: "ok" }, ...]

// keepOwnerVaultsAlive only extends the vaults themselves — extend the
// factory's own per-owner index entry alongside it if you want both:
await (await extendVaultsByOwnerTtl(factory, "G...")).signAndSend();
```

### Reading full state at once

`balance()`, `owner()`, `token()`, `paused()`, etc. are each their own
RPC round trip. For a dashboard or explorer that wants all of a vault's
(or factory's) state, `getVaultSnapshot`/`getFactorySnapshot` fetch every
field in parallel instead of you sequencing them:

```ts
import { getVaultSnapshot, getFactorySnapshot } from "@lumenforge/sdk";

const { balance, owner, pendingOwner, token, minDeposit, maxBalance, paused } =
  await getVaultSnapshot(vault);

const { vaultCount, vaultWasmHash } = await getFactorySnapshot(factory);
```

### Decoding events

Neither `VaultClient` nor `FactoryClient` decodes event bodies — a call
just gives you the return value. To read what a vault or factory
actually *did* (for an indexer, an activity feed, etc.), decode the raw
events yourself with `decodeVaultEvent`/`decodeFactoryEvent`:

```ts
import { decodeVaultEvent } from "@lumenforge/sdk";

const { events } = await server.getEvents({
  filters: [{ type: "contract", contractIds: [vaultContractId] }],
  startLedger,
});

for (const raw of events) {
  const decoded = decodeVaultEvent(raw); // undefined if it's not one of ours
  if (decoded?.type === "deposit") {
    console.log(decoded.from, decoded.amount, decoded.new_balance);
  }
}
```

Or decode the whole batch at once with `decodeVaultEvents`/`decodeFactoryEvents`,
which drop anything unrecognized instead of you filtering `undefined`s:

```ts
import { decodeVaultEvents } from "@lumenforge/sdk";

const deposits = decodeVaultEvents(events).filter((e) => e.type === "deposit");
```

Returns `undefined` (never throws) for anything that isn't a known
`lumen_vault`/`lumen_vault_factory` event — including the SEP-41 token's
own `transfer` event, which shows up alongside `deposit`/`withdraw`/
`rescue` since those call the token internally. See `src/events.ts` for
the full `VaultEvent`/`FactoryEvent` union (one variant per contract
event: `deposit`, `withdraw`, `paused`, `resumed`, `owner_proposed`,
`owner_proposal_cancelled`, `owner_transferred`, `min_deposit_updated`,
`max_balance_updated`, `rescued`, `vault_deployed`).

### Errors

Both `connectVault` and `connectFactory` (and `deployVault`) wire up
`errorTypes` from `VAULT_ERROR_TYPES`/`FACTORY_ERROR_TYPES` automatically,
so a failed call throws with a readable message (e.g.
`InsufficientBalance: withdrawal exceeds the vault's balance.`) instead
of a raw host trap.

## Develop

```bash
npm install
npm run build
npm test
npm run lint
```

`src/spec.test.ts` parses the compiled contract Wasm checked into
`test/fixtures/` and asserts every method/constructor param this SDK
exposes actually exists in the real contract spec (names, param order,
and declared error codes) — so a Rust-side rename or signature change
fails this SDK's tests, not just a runtime call. Regenerate the fixtures
after changing the contracts:

```bash
cp ../lumenforge-contracts/target/wasm32v1-none/release/lumen_vault.wasm test/fixtures/
cp ../lumenforge-contracts/target/wasm32v1-none/release/lumen_vault_factory.wasm test/fixtures/
```

## CLI

A thin command-line wrapper ships alongside the library, for scripting
rather than building an app — a cron job that keeps vaults alive, a
quick balance check, exercising a deployment without writing a script:

```bash
npm install -g @lumenforge/sdk   # or: npx @lumenforge/sdk ...
export LUMENFORGE_RPC_URL="https://soroban-testnet.stellar.org"
export LUMENFORGE_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

lumenforge vault snapshot --contract C... --public-key G...
```

**Not a wallet.** State-changing commands sign with a `Keypair` built
from `LUMENFORGE_SECRET_KEY` — read **only** from that environment
variable, never accepted as a `--flag` (a flag is visible to `ps` and
lands in shell history). The secret lives in the process only for the
duration of the command. Appropriate for a server-side script or a
scheduled job you control; not for handling funds on behalf of anyone
else.

```bash
export LUMENFORGE_SECRET_KEY="S..."

lumenforge vault deposit --contract C... --from G... --amount 500
lumenforge vault withdraw --contract C... --amount 200
lumenforge vault keep-alive --contract C...

lumenforge factory deploy-vault --contract C... --owner G... --token C... --min-deposit 0
lumenforge factory list-vaults --contract C... --owner G... --with-snapshots
lumenforge factory keep-owner-vaults-alive --contract C... --owner G...

lumenforge events list --contract C... --start-ledger 123456 --kind vault
```

Run `lumenforge --help` for the full command list. This wraps a subset
of the library's surface (the common scripting cases) — for anything
else, use the library directly.

## Related

- [`lumenforge-contracts`](https://github.com/StellarCrove/lumenforge-contracts)
  — the Soroban contracts this SDK talks to.
