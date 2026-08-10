/**
 * Salt helpers for `LumenVaultFactory.deploy_vault`. Soroban derives a
 * deployed contract's address from `(deployer, salt, wasm_hash)`, so a
 * salt reused by the same caller collides with the first deployment.
 */
export function randomSalt(): Buffer {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  return Buffer.from(salt);
}

/**
 * Deterministic salt derived from an owner address and a caller-supplied
 * nonce (e.g. "their Nth vault"). Useful when you want the same
 * (owner, nonce) pair to always resolve to the same vault address.
 */
export async function ownerNonceSalt(
  owner: string,
  nonce: number,
): Promise<Buffer> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(`${owner}:${nonce}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(digest);
}
