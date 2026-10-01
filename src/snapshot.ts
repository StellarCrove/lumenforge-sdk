import { withRetry, type RetryOptions } from "./utils/retry.js";

/**
 * Batched reads of a vault's/factory's full on-chain state. Each field on
 * `VaultClient`/`FactoryClient` is its own RPC round trip; a dashboard or
 * explorer that wants "everything about this vault" would otherwise have
 * to either sequence seven calls or hand-roll the `Promise.all`. These
 * just do that once, in parallel, and unwrap `.result` for you.
 */

export interface SnapshotOptions {
  /** Optional retry options for transient RPC network errors. */
  retry?: RetryOptions;
}

export interface VaultSnapshot {
  balance: bigint;
  owner: string;
  pendingOwner: string | undefined;
  token: string;
  minDeposit: bigint;
  maxBalance: bigint | undefined;
  paused: boolean;
}

/** The subset of `VaultClient` this needs — any real one has all of it. */
export interface VaultReader {
  balance(): Promise<{ result: bigint }>;
  owner(): Promise<{ result: string }>;
  pending_owner(): Promise<{ result: string | undefined }>;
  token(): Promise<{ result: string }>;
  min_deposit(): Promise<{ result: bigint }>;
  max_balance(): Promise<{ result: bigint | undefined }>;
  paused(): Promise<{ result: boolean }>;
}

/**
 * Reads every field of a vault in parallel. Rejects if any individual
 * call would (e.g. `owner()`/`token()` throwing `NotInitialized` for a
 * vault that somehow isn't — this doesn't paper over that, it just
 * doesn't make you sequence the seven calls to find out).
 * Automatically retries transient RPC errors using exponential backoff.
 */
export async function getVaultSnapshot(
  vault: VaultReader,
  options?: SnapshotOptions,
): Promise<VaultSnapshot> {
  const retryOpts = options?.retry;
  const [balance, owner, pendingOwner, token, minDeposit, maxBalance, paused] =
    await Promise.all([
      withRetry(() => vault.balance(), retryOpts),
      withRetry(() => vault.owner(), retryOpts),
      withRetry(() => vault.pending_owner(), retryOpts),
      withRetry(() => vault.token(), retryOpts),
      withRetry(() => vault.min_deposit(), retryOpts),
      withRetry(() => vault.max_balance(), retryOpts),
      withRetry(() => vault.paused(), retryOpts),
    ]);
  return {
    balance: balance.result,
    owner: owner.result,
    pendingOwner: pendingOwner.result,
    token: token.result,
    minDeposit: minDeposit.result,
    maxBalance: maxBalance.result,
    paused: paused.result,
  };
}

export interface FactorySnapshot {
  vaultCount: number;
  vaultWasmHash: Buffer;
}

/** The subset of `FactoryClient` this needs. */
export interface FactoryReader {
  vault_count(): Promise<{ result: number }>;
  vault_wasm_hash(): Promise<{ result: Buffer }>;
}

/** Reads a factory's own state (not any specific owner's vaults) in parallel. */
export async function getFactorySnapshot(
  factory: FactoryReader,
  options?: SnapshotOptions,
): Promise<FactorySnapshot> {
  const retryOpts = options?.retry;
  const [vaultCount, vaultWasmHash] = await Promise.all([
    withRetry(() => factory.vault_count(), retryOpts),
    withRetry(() => factory.vault_wasm_hash(), retryOpts),
  ]);
  return {
    vaultCount: vaultCount.result,
    vaultWasmHash: vaultWasmHash.result,
  };
}
