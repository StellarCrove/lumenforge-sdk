import {
  Account,
  Operation,
  Transaction,
  TransactionBuilder,
  TimeoutInfinite,
  nativeToScVal,
  type xdr,
} from "@stellar/stellar-sdk";
import type { AssembledTransaction, MethodOptions } from "@stellar/stellar-sdk/contract";

/**
 * Maximum number of contract invocations allowed in a single Stellar transaction envelope.
 * Soroban and Stellar Core enforce a hard ceiling of 100 operations per transaction.
 */
export const MAX_BATCH_SIZE = 100;

/** Default batch size for multi-vault keepAlive operations. */
export const DEFAULT_BATCH_SIZE = 100;

/**
 * Anything exposing `extend_ttl` — both `VaultClient` and `FactoryClient`
 * do. Neither contract can wake itself up to renew its own storage TTL
 * (Soroban contracts can't self-trigger), so calling this periodically
 * from off-chain is the only way to keep one alive indefinitely. See
 * Known Limitation #1 in `lumenforge-contracts`' `docs/security.md`.
 */
export interface TtlExtendable {
  extend_ttl(
    args: { threshold: number; extend_to: number },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<null>>;
}

/** A `FactoryClient`'s per-owner `VaultsByOwner` TTL extension method. */
export interface VaultsByOwnerTtlExtendable {
  extend_vaults_by_owner_ttl(
    args: { owner: string; threshold: number; extend_to: number },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<null>>;
}

export interface KeepAliveOptions {
  /**
   * Only extend if the entry's remaining TTL (in ledgers) is at or below
   * this. Default 17280 (~1 day at 5s/ledger) — comfortably above the
   * minimum a keeper is likely to be scheduled at, so a slightly delayed
   * run doesn't miss the window.
   */
  threshold?: number;
  /**
   * Ledger to extend the TTL *to* (an absolute distance from the current
   * ledger, per Soroban's `extend_ttl` semantics — not a duration).
   * Default 518400 (~30 days at 5s/ledger).
   */
  extendTo?: number;
}

const DEFAULT_THRESHOLD = 17280;
const DEFAULT_EXTEND_TO = 518400;

function resolveOptions(options: KeepAliveOptions): {
  threshold: number;
  extend_to: number;
} {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const extend_to = options.extendTo ?? DEFAULT_EXTEND_TO;
  if (!Number.isInteger(threshold) || threshold < 0) {
    throw new Error(
      `extendTtl: threshold must be a non-negative integer, got ${threshold}`,
    );
  }
  if (!Number.isInteger(extend_to) || extend_to < threshold) {
    throw new Error(
      `extendTtl: extendTo must be an integer >= threshold, got ${extend_to}`,
    );
  }
  return { threshold, extend_to };
}

/**
 * Extends `target`'s own instance TTL (a `VaultClient` or `FactoryClient`).
 * Returns the assembled transaction — call `.signAndSend()` to actually
 * submit it, same as any other client method.
 */
export async function extendTtl(
  target: TtlExtendable,
  options: KeepAliveOptions = {},
): Promise<AssembledTransaction<null>> {
  return target.extend_ttl(resolveOptions(options));
}

/**
 * Extends a specific owner's `VaultsByOwner` persistent entry TTL on a
 * factory. Rejects with `NoVaultsForOwner` if that owner has never
 * deployed a vault through this factory — same as calling the contract
 * method directly.
 */
export async function extendVaultsByOwnerTtl(
  factory: VaultsByOwnerTtlExtendable,
  owner: string,
  options: KeepAliveOptions = {},
): Promise<AssembledTransaction<null>> {
  const { threshold, extend_to } = resolveOptions(options);
  return factory.extend_vaults_by_owner_ttl({ owner, threshold, extend_to });
}

export interface KeepAliveResult<T> {
  target: T;
  status: "ok" | "error";
  error?: unknown;
}

/**
 * Runs `extendTtl` across every target, signing and sending each
 * extension in turn. One target's failure (a stale `AssembledTransaction`,
 * a network error, an unauthorized signer) doesn't stop the others — each
 * result is reported independently so a scheduled keeper run can retry
 * only what failed instead of the whole batch.
 *
 * This is the "policy" half of TTL management: the contracts expose the
 * mechanism (`extend_ttl`), but nothing on-chain calls it on a schedule —
 * that has to be an off-chain keeper. Run this from a cron job (or any
 * periodic scheduler) against every vault/factory you want to keep alive.
 */
export async function keepAlive<T extends TtlExtendable>(
  targets: readonly T[],
  options: KeepAliveOptions = {},
): Promise<KeepAliveResult<T>[]> {
  const results: KeepAliveResult<T>[] = [];
  for (const target of targets) {
    try {
      const tx = await extendTtl(target, options);
      await tx.signAndSend();
      results.push({ target, status: "ok" });
    } catch (error) {
      results.push({ target, status: "error", error });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  Multi-operation transaction builder for batch keepAlive           */
/* ------------------------------------------------------------------ */

/**
 * Builds a single Soroban `invokeContractFunction` operation invoking
 * `extend_ttl(threshold, extend_to)` on the specified contract address.
 */
export function buildBatchExtendTtlOperation(
  contractAddress: string,
  options: KeepAliveOptions = {},
): xdr.Operation {
  const { threshold, extend_to } = resolveOptions(options);
  return Operation.invokeContractFunction({
    contract: contractAddress,
    function: "extend_ttl",
    args: [
      nativeToScVal(threshold, { type: "u32" }),
      nativeToScVal(extend_to, { type: "u32" }),
    ],
  });
}

/**
 * Builds an array of Soroban operations invoking `extend_ttl` across
 * up to 100 contracts for inclusion in a single transaction envelope.
 */
export function buildBatchExtendTtlOperations(
  contractAddresses: readonly string[],
  options: KeepAliveOptions = {},
): xdr.Operation[] {
  if (contractAddresses.length === 0) {
    throw new Error("buildBatchExtendTtlOperations: contractAddresses must not be empty");
  }
  if (contractAddresses.length > MAX_BATCH_SIZE) {
    throw new Error(
      `buildBatchExtendTtlOperations: contract count (${contractAddresses.length}) exceeds maximum batch size of ${MAX_BATCH_SIZE}`,
    );
  }
  return contractAddresses.map((addr) => buildBatchExtendTtlOperation(addr, options));
}

export interface BuildBatchExtendTtlTxParams {
  sourceAccount: Account;
  networkPassphrase: string;
  contractAddresses: readonly string[];
  options?: KeepAliveOptions;
  fee?: string;
  timeout?: number;
}

/**
 * Builds a multi-operation Stellar `Transaction` containing bundled `extend_ttl`
 * invocations for up to 100 contracts.
 */
export function buildBatchExtendTtlTransaction(
  params: BuildBatchExtendTtlTxParams,
): Transaction {
  const operations = buildBatchExtendTtlOperations(
    params.contractAddresses,
    params.options,
  );

  const builder = new TransactionBuilder(params.sourceAccount, {
    fee: params.fee ?? "100",
    networkPassphrase: params.networkPassphrase,
  });

  if (params.timeout !== undefined) {
    builder.setTimeout(params.timeout);
  } else {
    builder.setTimeout(TimeoutInfinite);
  }

  for (const op of operations) {
    builder.addOperation(op);
  }

  return builder.build();
}

/* ------------------------------------------------------------------ */
/*  High-level batch runner with failure isolation                    */
/* ------------------------------------------------------------------ */

export interface BatchKeepAliveOptions extends KeepAliveOptions {
  /**
   * Maximum number of extend_ttl invocations to bundle in a single batch.
   * Must be a positive integer <= 100. Default 100.
   */
  batchSize?: number;

  /**
   * Whether to fall back to individual sequential transactions if a batch
   * fails simulation or submission. Default `true`.
   */
  fallbackToIndividual?: boolean;

  /**
   * Optional callback invoked after each batch completes.
   */
  onBatchComplete?: (batch: BatchSummary) => void;
}

export interface BatchSummary {
  /** 0-based index of the batch. */
  index: number;
  /** Number of targets in this batch. */
  size: number;
  /**
   * - "ok": batch succeeded
   * - "fallback": batch failed and fell back to individual submissions
   * - "error": batch failed and fallback was disabled or all targets failed
   */
  status: "ok" | "fallback" | "error";
  /** Error encountered if the batch failed as a whole. */
  error?: unknown;
}

export interface BatchKeepAliveResult<T> {
  batches: BatchSummary[];
  results: KeepAliveResult<T>[];
}

function resolveBatchOptions(options: BatchKeepAliveOptions): {
  threshold?: number;
  extendTo?: number;
  batchSize: number;
  fallbackToIndividual: boolean;
  onBatchComplete?: (batch: BatchSummary) => void;
} {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(
      `batchKeepAlive: batchSize must be a positive integer, got ${batchSize}`,
    );
  }
  if (batchSize > MAX_BATCH_SIZE) {
    throw new Error(
      `batchKeepAlive: batchSize must not exceed ${MAX_BATCH_SIZE}, got ${batchSize}`,
    );
  }

  if (options.threshold !== undefined) {
    if (!Number.isInteger(options.threshold) || options.threshold < 0) {
      throw new Error(
        `extendTtl: threshold must be a non-negative integer, got ${options.threshold}`,
      );
    }
  }
  if (options.extendTo !== undefined) {
    const t = options.threshold ?? DEFAULT_THRESHOLD;
    if (!Number.isInteger(options.extendTo) || options.extendTo < t) {
      throw new Error(
        `extendTtl: extendTo must be an integer >= threshold, got ${options.extendTo}`,
      );
    }
  }

  return {
    threshold: options.threshold,
    extendTo: options.extendTo,
    batchSize,
    fallbackToIndividual: options.fallbackToIndividual ?? true,
    onBatchComplete: options.onBatchComplete,
  };
}

async function extendSingleTarget<T extends TtlExtendable>(
  target: T,
  options: KeepAliveOptions,
): Promise<KeepAliveResult<T>> {
  try {
    const tx = await extendTtl(target, options);
    await tx.signAndSend();
    return { target, status: "ok" };
  } catch (error) {
    return { target, status: "error", error };
  }
}

/**
 * Runs batch `extendTtl` across fleets of vaults or factories, bundling up to
 * 100 contract invocations per transaction within Stellar ledger limits.
 *
 * Provides automatic failure isolation: if a batch simulation or submission
 * fails (due to a stale contract, network glitch, or invalid state), it
 * falls back to submitting targets individually so healthy vaults are renewed
 * without being blocked by unhealthy ones.
 */
export async function batchKeepAlive<T extends TtlExtendable>(
  targets: readonly T[],
  options: BatchKeepAliveOptions = {},
): Promise<BatchKeepAliveResult<T>> {
  if (targets.length === 0) {
    return { batches: [], results: [] };
  }

  const resolved = resolveBatchOptions(options);
  const keepAliveOpts: KeepAliveOptions = {
    threshold: resolved.threshold,
    extendTo: resolved.extendTo,
  };

  const batches: BatchSummary[] = [];
  const results: KeepAliveResult<T>[] = [];

  for (let i = 0; i < targets.length; i += resolved.batchSize) {
    const chunk = targets.slice(i, i + resolved.batchSize);
    const batchIndex = Math.floor(i / resolved.batchSize);

    let batchStatus: BatchSummary["status"] = "ok";
    let batchError: unknown;

    try {
      // Step 1: assemble transactions for all targets in this batch
      const assembledTxs = await Promise.all(
        chunk.map((target) => extendTtl(target, keepAliveOpts)),
      );

      // Step 2: submit the batch
      const sendPromises = assembledTxs.map((tx) => tx.signAndSend());
      await Promise.all(sendPromises);

      for (const target of chunk) {
        results.push({ target, status: "ok" });
      }
    } catch (err) {
      batchError = err;

      if (resolved.fallbackToIndividual) {
        batchStatus = "fallback";
        const fallbackResults: KeepAliveResult<T>[] = [];

        for (const target of chunk) {
          const res = await extendSingleTarget(target, keepAliveOpts);
          fallbackResults.push(res);
          results.push(res);
        }

        const anyOk = fallbackResults.some((r) => r.status === "ok");
        if (!anyOk && fallbackResults.length > 0) {
          batchStatus = "error";
        }
      } else {
        batchStatus = "error";
        for (const target of chunk) {
          results.push({ target, status: "error", error: err });
        }
      }
    }

    const summary: BatchSummary = {
      index: batchIndex,
      size: chunk.length,
      status: batchStatus,
      ...(batchError ? { error: batchError } : {}),
    };

    batches.push(summary);
    resolved.onBatchComplete?.(summary);
  }

  return { batches, results };
}
