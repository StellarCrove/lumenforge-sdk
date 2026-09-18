import type { AssembledTransaction, MethodOptions } from "@stellar/stellar-sdk/contract";

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
