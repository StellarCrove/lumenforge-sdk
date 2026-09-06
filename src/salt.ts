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
 *
 * `nonce` must be a non-negative safe integer — a fractional or unsafe
 * value would still hash to *a* salt, just not one the caller could
 * reproduce by counting, which defeats the point of a deterministic
 * salt.
 */
export async function ownerNonceSalt(
  owner: string,
  nonce: number,
): Promise<Buffer> {
  if (!Number.isSafeInteger(nonce) || nonce < 0) {
    throw new Error(
      `ownerNonceSalt: nonce must be a non-negative safe integer, got ${nonce}`,
    );
  }
  const encoder = new TextEncoder();
  const bytes = encoder.encode(`${owner}:${nonce}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(digest);
}
