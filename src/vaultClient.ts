import {
  Client,
  type AssembledTransaction,
  type ClientOptions,
  type MethodOptions,
} from "@stellar/stellar-sdk/contract";
import { VAULT_ERROR_TYPES } from "./errors.js";

/**
 * Typed method surface for a deployed `lumen_vault` contract. Field/method
 * names match the Rust contract's function names exactly — this is what
 * `contract.Client` dispatches on internally.
 */
export interface VaultMethods {
  deposit(
    args: { from: string; amount: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>;
  withdraw(
    args: { amount: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint>>;
  pause(options?: MethodOptions): Promise<AssembledTransaction<null>>;
  unpause(options?: MethodOptions): Promise<AssembledTransaction<null>>;
  propose_owner(
    args: { new_owner: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<null>>;
  accept_owner(options?: MethodOptions): Promise<AssembledTransaction<null>>;
  balance(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  owner(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  pending_owner(
    options?: MethodOptions,
  ): Promise<AssembledTransaction<string | undefined>>;
  paused(options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  extend_ttl(
    args: { threshold: number; extend_to: number },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<null>>;
}

export type VaultClient = Client & VaultMethods;

/**
 * Connects to a deployed `lumen_vault` contract, fetching its on-chain
 * spec so calls are validated and results are decoded automatically.
 */
export function connectVault(
  options: Omit<ClientOptions, "errorTypes">,
): Promise<VaultClient> {
  return Client.from<VaultMethods>({
    ...options,
    errorTypes: VAULT_ERROR_TYPES,
  });
}
