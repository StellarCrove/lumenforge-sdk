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
  set_min_deposit(
    args: { min_deposit: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<null>>;
  set_max_balance(
    args: { max_balance: bigint | undefined },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<null>>;
  rescue(
    args: { token: string; to: string; amount: bigint },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<null>>;
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
  token(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  min_deposit(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  max_balance(
    options?: MethodOptions,
  ): Promise<AssembledTransaction<bigint | undefined>>;
  paused(options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  extend_ttl(
    args: { threshold: number; extend_to: number },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<null>>;
}

export type VaultClient = Client & VaultMethods;

/**
 * Connects to an already-deployed `lumen_vault` contract, fetching its
 * on-chain spec so calls are validated and results are decoded
 * automatically.
 */
export function connectVault(
  options: Omit<ClientOptions, "errorTypes">,
): Promise<VaultClient> {
  return Client.from<VaultMethods>({
    ...options,
    errorTypes: VAULT_ERROR_TYPES,
  });
}

export interface DeployVaultArgs {
  owner: string;
  token: string;
  min_deposit: bigint;
  max_balance?: bigint;
}

export interface DeployVaultOptions
  extends MethodOptions,
    Omit<ClientOptions, "contractId" | "errorTypes"> {
  /** The hash of the `lumen_vault` Wasm blob, already installed on-chain. */
  wasmHash: Buffer | string;
  /** Salt for the deployed contract's address. Default: random. */
  salt?: Buffer | Uint8Array;
  format?: "hex" | "base64";
  /** The address that will send the deployment transaction. */
  address?: string;
}

/**
 * Deploys a new `lumen_vault` directly (without going through
 * `LumenVaultFactory`). Returns an `AssembledTransaction` — call
 * `.signAndSend()` to actually deploy; `.result` afterward is a
 * `VaultClient` connected to the new instance.
 */
export function deployVault(
  args: DeployVaultArgs,
  options: DeployVaultOptions,
): Promise<AssembledTransaction<VaultClient>> {
  return Client.deploy<VaultClient>(args, {
    ...options,
    errorTypes: VAULT_ERROR_TYPES,
  });
}
