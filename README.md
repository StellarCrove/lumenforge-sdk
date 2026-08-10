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

Use `ownerNonceSalt(owner, nonce)` instead of `randomSalt()` if you want
a deterministic, reproducible vault address for a given
`(owner, nonce)` pair.

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

Both are guaranteed to terminate: they stop at the first page shorter
than `pageSize`, and throw (rather than loop forever) if `maxPages`
(default 1000) is hit without that ever happening — protection against a
misbehaving contract that always returns full pages.

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

## Related

- [`lumenforge-contracts`](https://github.com/StellarCrove/lumenforge-contracts)
  — the Soroban contracts this SDK talks to.
