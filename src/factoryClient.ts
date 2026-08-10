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
