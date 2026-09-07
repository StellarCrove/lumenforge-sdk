import {
  Client,
  type AssembledTransaction,
  type ClientOptions,
  type MethodOptions,
} from "@stellar/stellar-sdk/contract";
import { FACTORY_ERROR_TYPES } from "./errors.js";
import { ownerNonceSalt, randomSalt } from "./salt.js";

/**
 * Typed method surface for a deployed `lumen_vault_factory` contract.
 */
export interface FactoryMethods {
  deploy_vault(
    args: {
      owner: string;
      token: string;
      min_deposit: bigint;
      max_balance: bigint | undefined;
      salt: Buffer;
    },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<string>>;
  vault_count(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  vaults_by_owner(
    args: { owner: string; offset: number; limit: number },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<string[]>>;
  vaults_by_owner_count(
    args: { owner: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<number>>;
  vault_wasm_hash(
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Buffer>>;
  extend_ttl(
    args: { threshold: number; extend_to: number },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<null>>;
  extend_vaults_by_owner_ttl(
    args: { owner: string; threshold: number; extend_to: number },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<null>>; // rejects if the owner has no vaults
}

export type FactoryClient = Client & FactoryMethods;

/**
 * Connects to a deployed `lumen_vault_factory` contract, fetching its
 * on-chain spec so calls are validated and results are decoded
 * automatically.
 */
export function connectFactory(
  options: Omit<ClientOptions, "errorTypes">,
): Promise<FactoryClient> {
  return Client.from<FactoryMethods>({
    ...options,
    errorTypes: FACTORY_ERROR_TYPES,
  });
}

export interface DeployVaultViaFactoryArgs {
  owner: string;
  token: string;
  min_deposit: bigint;
  max_balance?: bigint;
}

export interface DeployVaultViaFactoryOptions extends MethodOptions {
  /**
   * How to derive the 32-byte deployment salt. Soroban addresses the new
   * vault from `(factory, salt, wasmHash)`, so it must be unique per
   * `(factory, owner)` — reusing one fails on the second deploy.
   *
   * - a 32-byte `Buffer`/`Uint8Array` — used as-is
   * - `{ nonce }` — deterministic: `ownerNonceSalt(owner, nonce)`, so the
   *   same `(owner, nonce)` always resolves to the same vault address
   * - omitted — a fresh random salt (`randomSalt()`)
   */
  salt?: Buffer | Uint8Array | { nonce: number };
}

/** The one method `deployVaultViaFactory` calls. */
export interface VaultDeployer {
  deploy_vault(
    args: {
      owner: string;
      token: string;
      min_deposit: bigint;
      max_balance: bigint | undefined;
      salt: Buffer;
    },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<string>>;
}

/**
 * Deploys a `lumen_vault` **through the factory** (so it lands in the
 * factory's per-owner index — unlike {@link deployVault}, which deploys a
 * standalone instance). Handles salt derivation; you still call
 * `.signAndSend()` on the returned transaction, after which `.result` is
 * the new vault's contract-address string.
 */
export async function deployVaultViaFactory(
  factory: VaultDeployer,
  args: DeployVaultViaFactoryArgs,
  options: DeployVaultViaFactoryOptions = {},
): Promise<AssembledTransaction<string>> {
  const { salt: saltOpt, ...methodOptions } = options;

  let salt: Buffer;
  if (saltOpt == null) {
    salt = randomSalt();
  } else if (saltOpt instanceof Uint8Array) {
    if (saltOpt.length !== 32) {
      throw new Error(
        `deployVaultViaFactory: salt must be 32 bytes, got ${saltOpt.length}`,
      );
    }
    salt = Buffer.from(saltOpt);
  } else {
    salt = await ownerNonceSalt(args.owner, saltOpt.nonce);
  }

  return factory.deploy_vault(
    {
      owner: args.owner,
      token: args.token,
      min_deposit: args.min_deposit,
      max_balance: args.max_balance,
      salt,
    },
    methodOptions,
  );
}

/** The minimal capability `iterateVaultsByOwner` actually needs. */
export interface VaultsByOwnerReader {
  vaults_by_owner(args: {
    owner: string;
    offset: number;
    limit: number;
  }): Promise<{ result: string[] }>;
  /**
   * Optional. When present (a real `FactoryClient` has it),
   * `iterateVaultsByOwner` reads the total once and stops at exactly
   * that many vaults — deterministic, no reliance on a short page and no
   * `maxPages` guard needed. Absent (e.g. an older factory or a hand-
   * rolled reader), it falls back to the short-page + `maxPages` scheme.
   */
  vaults_by_owner_count?(args: {
    owner: string;
  }): Promise<{ result: number }>;
}

export interface PaginationOptions {
  /** Vaults fetched per on-chain call. Default 50. */
  pageSize?: number;
  /**
   * Hard cap on the number of pages fetched, used only on the fallback
   * path (a reader without `vaults_by_owner_count`). There, a misbehaving
   * or malicious contract could keep returning full pages forever
   * (`vaults_by_owner` alone never signals "no more" other than by
   * returning fewer than `limit`), so we refuse to loop past this no
   * matter what comes back. Default 1000 (50,000 vaults at the default
   * page size). Ignored when the reader exposes `vaults_by_owner_count`.
   */
  maxPages?: number;
}

/**
 * Pages through every vault for `owner`, yielding one address at a time.
 * Always terminates:
 *
 * - If the reader exposes `vaults_by_owner_count` (a real `FactoryClient`
 *   does), the total is read once up front and iteration stops at
 *   exactly that many vaults — no short-page guessing, `maxPages` unused.
 * - Otherwise it stops as soon as a page comes back shorter than
 *   `pageSize`, and throws if `maxPages` is hit first.
 */
export async function* iterateVaultsByOwner(
  factory: VaultsByOwnerReader,
  owner: string,
  options: PaginationOptions = {},
): AsyncGenerator<string, void, void> {
  const pageSize = options.pageSize ?? 50;
  const maxPages = options.maxPages ?? 1000;
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("iterateVaultsByOwner: pageSize must be a positive integer");
  }
  if (!Number.isInteger(maxPages) || maxPages <= 0) {
    throw new Error("iterateVaultsByOwner: maxPages must be a positive integer");
  }

  if (factory.vaults_by_owner_count) {
    const { result: total } = await factory.vaults_by_owner_count({ owner });
    for (let offset = 0; offset < total; offset += pageSize) {
      const { result } = await factory.vaults_by_owner({
        owner,
        offset,
        limit: Math.min(pageSize, total - offset),
      });
      for (const vault of result) {
        yield vault;
      }
      // A contract that under-reports its count (returns fewer than
      // promised) would otherwise spin at the same offset — advancing by
      // `pageSize` regardless keeps this terminating.
      if (result.length === 0) {
        return;
      }
    }
    return;
  }

  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    const { result } = await factory.vaults_by_owner({
      owner,
      offset,
      limit: pageSize,
    });

    for (const vault of result) {
      yield vault;
    }

    if (result.length < pageSize) {
      return; // short page — this was the last one
    }
    offset += pageSize;
  }

  throw new Error(
    `iterateVaultsByOwner: hit maxPages (${maxPages}) for owner ${owner} without ` +
      "the contract ever returning a short page. Refusing to loop further — pass " +
      "a larger maxPages if this owner genuinely has that many vaults.",
  );
}

/** Convenience wrapper around `iterateVaultsByOwner` that collects every result. */
export async function collectVaultsByOwner(
  factory: VaultsByOwnerReader,
  owner: string,
  options: PaginationOptions = {},
): Promise<string[]> {
  const vaults: string[] = [];
  for await (const vault of iterateVaultsByOwner(factory, owner, options)) {
    vaults.push(vault);
  }
  return vaults;
}
