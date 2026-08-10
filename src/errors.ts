/**
 * Mirrors the `#[contracterror] enum Error` in each Rust contract. Passed
 * as `errorTypes` to `contract.Client`, so failed calls surface a readable
 * message (via `AssembledTransaction`'s error parsing) instead of a raw
 * host trap.
 */
export const VAULT_ERROR_TYPES: Record<number, { message: string }> = {
  1: { message: "NotInitialized: the vault has no owner set." },
  2: { message: "InvalidAmount: amount must be a positive integer." },
  3: {
    message: "InsufficientBalance: withdrawal exceeds the vault's balance.",
  },
  4: {
    message: "Paused: the vault is paused and is not accepting deposits.",
  },
  5: {
    message: "NoPendingOwner: there is no ownership transfer to accept.",
  },
  6: { message: "Overflow: deposit would overflow the balance." },
};

export const FACTORY_ERROR_TYPES: Record<number, { message: string }> = {
  1: { message: "NotInitialized: the factory has no vault Wasm hash set." },
};
