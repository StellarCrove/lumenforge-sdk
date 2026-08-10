import {
  Client,
  type AssembledTransaction,
  type ClientOptions,
  type MethodOptions,
} from "@stellar/stellar-sdk/contract";
import { FACTORY_ERROR_TYPES } from "./errors.js";

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

/** The minimal capability `iterateVaultsByOwner` actually needs. */
export interface VaultsByOwnerReader {
  vaults_by_owner(args: {
    owner: string;
    offset: number;
    limit: number;
  }): Promise<{ result: string[] }>;
}

export interface PaginationOptions {
  /** Vaults fetched per on-chain call. Default 50. */
  pageSize?: number;
  /**
   * Hard cap on the number of pages fetched, independent of what the
   * contract reports. This is what actually guarantees termination: a
   * misbehaving or malicious contract could keep returning full pages
   * forever (`vaults_by_owner` never signals "no more" other than by
   * returning fewer than `limit` results), so we refuse to loop past
   * this no matter what comes back. Default 1000 (50,000 vaults at the
   * default page size).
   */
  maxPages?: number;
}

/**
 * Pages through every vault for `owner`, yielding one address at a
 * time. Always terminates: it stops as soon as a page comes back
 * shorter than `pageSize` (the normal "no more results" signal), and
 * throws if `maxPages` is hit first — it will never loop forever no
 * matter what the contract returns.
 */
export async function* iterateVaultsByOwner(
  factory: VaultsByOwnerReader,
  owner: string,
  options: PaginationOptions = {},
): AsyncGenerator<string, void, void> {
  const pageSize = options.pageSize ?? 50;
  const maxPages = options.maxPages ?? 1000;
  if (pageSize <= 0) {
    throw new Error("iterateVaultsByOwner: pageSize must be positive");
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
