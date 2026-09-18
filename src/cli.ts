#!/usr/bin/env node
/**
 * A thin command-line wrapper over this SDK, for scripting: cron jobs
 * (`keep-alive`), quick reads (`vault snapshot`), or exercising a
 * deployment without writing a script.
 *
 * Not a wallet. It signs with a secret key that lives in this process's
 * environment for exactly as long as the command runs — appropriate for
 * a server-side script or a scheduled job you control, not for handling
 * funds on behalf of anyone else. The secret is read **only** from the
 * `LUMENFORGE_SECRET_KEY` environment variable, never from a `--flag`
 * (a CLI flag is visible to anyone who can run `ps` on the host, and
 * lands in shell history).
 */
import { parseArgs } from "node:util";
import { Keypair, rpc } from "@stellar/stellar-sdk";
import { KeypairSigner } from "@stellar/stellar-sdk/contract";
import { connectFactory, deployVaultViaFactory, collectVaultsByOwner, collectVaultSnapshotsByOwner, keepOwnerVaultsAlive } from "./factoryClient.js";
import { decodeFactoryEvents, decodeVaultEvents } from "./events.js";
import { extendTtl } from "./keeper.js";
import { connectVault } from "./vaultClient.js";
import { getFactorySnapshot, getVaultSnapshot } from "./snapshot.js";

function fail(message: string): never {
  console.error(`lumenforge: ${message}`);
  process.exit(1);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) fail(`missing required environment variable ${name}`);
  return v;
}

function print(value: unknown): void {
  console.log(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2),
  );
}

interface Network {
  rpcUrl: string;
  networkPassphrase: string;
  /**
   * Auto-detected from the URL scheme, not a separate flag: an `http://`
   * RPC URL (a local standalone network, most likely) needs this or
   * every connect call rejects it outright. `https://` never sets it —
   * matches `rpc.Server`'s own "must be false in production" guidance.
   */
  allowHttp: boolean;
}

function getNetwork(): Network {
  const rpcUrl = requireEnv("LUMENFORGE_RPC_URL");
  return {
    rpcUrl,
    networkPassphrase: requireEnv("LUMENFORGE_NETWORK_PASSPHRASE"),
    allowHttp: rpcUrl.startsWith("http://"),
  };
}

/** For a state-changing call: a signer derived from `LUMENFORGE_SECRET_KEY`. */
function getSigner(networkPassphrase: string): KeypairSigner {
  const secret = requireEnv("LUMENFORGE_SECRET_KEY");
  return new KeypairSigner(Keypair.fromSecret(secret), networkPassphrase);
}

/**
 * For a read-only call: any valid account to simulate against. Uses
 * `--public-key` if given, else derives one from `LUMENFORGE_SECRET_KEY`
 * if that's set — either way, nothing is signed for a read.
 */
function getReadOnlyPublicKey(explicit: string | undefined): string {
  if (explicit) return explicit;
  const secret = process.env.LUMENFORGE_SECRET_KEY;
  if (secret) return Keypair.fromSecret(secret).publicKey();
  fail("pass --public-key, or set LUMENFORGE_SECRET_KEY, for a source account to simulate against");
}

// `parseArgs` throws synchronously — before `main()`'s try/catch exists to
// catch anything — on malformed input it doesn't just reject with a normal
// value for, e.g. a negative number as an option's argument (`-5`) reads as
// "looks like another flag" and throws `ERR_PARSE_ARGS_INVALID_OPTION_VALUE`.
// Caught here so that surfaces as a clean `lumenforge: ...` message instead
// of a raw stack trace; use `--flag=-5` to pass a literal negative value.
function parseCliArgs() {
  try {
    return parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      options: {
        contract: { type: "string" },
        owner: { type: "string" },
        token: { type: "string" },
        from: { type: "string" },
        amount: { type: "string" },
        "min-deposit": { type: "string" },
        "max-balance": { type: "string" },
        nonce: { type: "string" },
        "public-key": { type: "string" },
        threshold: { type: "string" },
        "extend-to": { type: "string" },
        "start-ledger": { type: "string" },
        kind: { type: "string" },
        "with-snapshots": { type: "boolean" },
        help: { type: "boolean" },
      },
    });
  } catch (err) {
    fail(`invalid arguments: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const { values, positionals } = parseCliArgs();

const USAGE = `lumenforge <resource> <action> [options]

Environment (always required):
  LUMENFORGE_RPC_URL             Soroban RPC endpoint
  LUMENFORGE_NETWORK_PASSPHRASE  e.g. "Test SDF Network ; September 2015"
Environment (required for state-changing commands; never pass as a flag):
  LUMENFORGE_SECRET_KEY          signs the transaction

vault snapshot   --contract <C...> [--public-key <G...>]
vault deposit     --contract <C...> --from <G...> --amount <n>
vault withdraw    --contract <C...> --amount <n>
vault keep-alive  --contract <C...> [--threshold <n>] [--extend-to <n>]

factory snapshot              --contract <C...> [--public-key <G...>]
factory deploy-vault          --contract <C...> --owner <G...> --token <C...> --min-deposit <n> [--max-balance <n>] [--nonce <n>]
factory list-vaults           --contract <C...> --owner <G...> [--with-snapshots] [--public-key <G...>]
factory keep-owner-vaults-alive --contract <C...> --owner <G...> [--threshold <n>] [--extend-to <n>]

events list       --contract <C...> --start-ledger <n> --kind vault|factory
`;

function requiredArg(name: string, value: string | undefined): string {
  if (value === undefined) fail(`missing required --${name}`);
  return value;
}

/** Parses `value` as a `bigint`, failing with a clean message instead of a raw `SyntaxError`. */
function parseBigintArg(name: string, value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    fail(`--${name} must be an integer, got ${JSON.stringify(value)}`);
  }
}

function requiredBigintArg(name: string, value: string | undefined): bigint {
  return parseBigintArg(name, requiredArg(name, value));
}

function optionalBigint(name: string, value: string | undefined): bigint | undefined {
  return value === undefined ? undefined : parseBigintArg(name, value);
}

/** Parses `value` as a non-negative integer `number` (e.g. a ledger sequence). */
function requiredIntArg(name: string, value: string | undefined): number {
  const parsed = Number(requiredArg(name, value));
  if (!Number.isInteger(parsed) || parsed < 0) {
    fail(`--${name} must be a non-negative integer, got ${JSON.stringify(value)}`);
  }
  return parsed;
}

/** Parses an optional integer flag (e.g. `--threshold`), distinguishing "absent" from an explicit but empty value. */
function optionalIntArg(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    fail(`--${name} must be an integer, got ${JSON.stringify(value)}`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const [resource, action] = positionals;
  if (values.help || !resource || !action) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  const net = getNetwork();

  if (resource === "vault") {
    const contractId = requiredArg("contract", values.contract);

    if (action === "snapshot") {
      const publicKey = getReadOnlyPublicKey(values["public-key"]);
      const vault = await connectVault({ contractId, ...net, publicKey });
      return print(await getVaultSnapshot(vault));
    }

    if (action === "deposit") {
      const from = requiredArg("from", values.from);
      const amount = requiredBigintArg("amount", values.amount);
      const signer = getSigner(net.networkPassphrase);
      const vault = await connectVault({ contractId, ...net, publicKey: signer.address, signTransaction: signer });
      const tx = await vault.deposit({ from, amount });
      return print(await tx.signAndSend());
    }

    if (action === "withdraw") {
      const amount = requiredBigintArg("amount", values.amount);
      const signer = getSigner(net.networkPassphrase);
      const vault = await connectVault({ contractId, ...net, publicKey: signer.address, signTransaction: signer });
      const tx = await vault.withdraw({ amount });
      return print(await tx.signAndSend());
    }

    if (action === "keep-alive") {
      const signer = getSigner(net.networkPassphrase);
      const vault = await connectVault({ contractId, ...net, publicKey: signer.address, signTransaction: signer });
      const threshold = optionalIntArg("threshold", values.threshold);
      const extendTo = optionalIntArg("extend-to", values["extend-to"]);
      const tx = await extendTtl(vault, { threshold, extendTo });
      return print(await tx.signAndSend());
    }

    fail(`unknown vault action: ${action}`);
  }

  if (resource === "factory") {
    const contractId = requiredArg("contract", values.contract);

    if (action === "snapshot") {
      const publicKey = getReadOnlyPublicKey(values["public-key"]);
      const factory = await connectFactory({ contractId, ...net, publicKey });
      return print(await getFactorySnapshot(factory));
    }

    if (action === "deploy-vault") {
      const owner = requiredArg("owner", values.owner);
      const token = requiredArg("token", values.token);
      const minDeposit = requiredBigintArg("min-deposit", values["min-deposit"]);
      const maxBalance = optionalBigint("max-balance", values["max-balance"]);
      const signer = getSigner(net.networkPassphrase);
      const factory = await connectFactory({ contractId, ...net, publicKey: signer.address, signTransaction: signer });
      const nonce = optionalIntArg("nonce", values.nonce);
      const salt = nonce !== undefined ? { nonce } : undefined;
      const tx = await deployVaultViaFactory(
        factory,
        { owner, token, min_deposit: minDeposit, max_balance: maxBalance },
        salt ? { salt } : {},
      );
      return print(await tx.signAndSend());
    }

    if (action === "list-vaults") {
      const owner = requiredArg("owner", values.owner);
      const publicKey = getReadOnlyPublicKey(values["public-key"]);
      const factory = await connectFactory({ contractId, ...net, publicKey });
      if (values["with-snapshots"]) {
        const results = await collectVaultSnapshotsByOwner(factory, owner, (address) =>
          connectVault({ contractId: address, ...net, publicKey }),
        );
        return print(results);
      }
      return print(await collectVaultsByOwner(factory, owner));
    }

    if (action === "keep-owner-vaults-alive") {
      const owner = requiredArg("owner", values.owner);
      const signer = getSigner(net.networkPassphrase);
      const factory = await connectFactory({ contractId, ...net, publicKey: signer.address, signTransaction: signer });
      const threshold = optionalIntArg("threshold", values.threshold);
      const extendTo = optionalIntArg("extend-to", values["extend-to"]);
      const results = await keepOwnerVaultsAlive(
        factory,
        owner,
        (address) => connectVault({ contractId: address, ...net, publicKey: signer.address, signTransaction: signer }),
        { threshold, extendTo },
      );
      return print(results);
    }

    fail(`unknown factory action: ${action}`);
  }

  if (resource === "events" && action === "list") {
    const contractId = requiredArg("contract", values.contract);
    const startLedger = requiredIntArg("start-ledger", values["start-ledger"]);
    const kind = requiredArg("kind", values.kind);
    if (kind !== "vault" && kind !== "factory") fail("--kind must be \"vault\" or \"factory\"");

    const server = new rpc.Server(net.rpcUrl, { allowHttp: net.allowHttp });
    const { events } = await server.getEvents({
      filters: [{ type: "contract", contractIds: [contractId] }],
      startLedger,
    });
    return print(kind === "vault" ? decodeVaultEvents(events) : decodeFactoryEvents(events));
  }

  fail(`unknown command: ${resource} ${action}`);
}

main().catch((err: unknown) => {
  console.error(`lumenforge: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
