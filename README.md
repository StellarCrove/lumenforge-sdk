# lumenforge-sdk

TypeScript client SDK for interacting with the [LumenForge Soroban
contracts](https://github.com/lumenforge/lumenforge-contracts) on Stellar.

## Install

```bash
npm install @lumenforge/sdk
```

## Usage

```ts
import { LumenVaultClient } from "@lumenforge/sdk";

const client = new LumenVaultClient({
  contractId: "C...",
  rpcUrl: "https://soroban-testnet.stellar.org",
});

const balance = await client.balance();
```

## Develop

```bash
npm install
npm run build
npm test
```

## Related

- [`lumenforge-contracts`](https://github.com/lumenforge/lumenforge-contracts)
  — the Soroban contracts this SDK talks to.
