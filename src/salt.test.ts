import { describe, expect, it } from "vitest";
import { ownerNonceSalt, randomSalt } from "./salt.js";

describe("randomSalt", () => {
  it("returns 32 bytes", () => {
    expect(randomSalt().length).toBe(32);
  });

  it("is not deterministic", () => {
    expect(randomSalt().equals(randomSalt())).toBe(false);
  });
});

describe("ownerNonceSalt", () => {
  const owner = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

  it("returns 32 bytes", async () => {
    const salt = await ownerNonceSalt(owner, 0);
    expect(salt.length).toBe(32);
  });

  it("is deterministic for the same owner and nonce", async () => {
    const a = await ownerNonceSalt(owner, 3);
    const b = await ownerNonceSalt(owner, 3);
    expect(a.equals(b)).toBe(true);
  });

  it("differs across nonces", async () => {
    const a = await ownerNonceSalt(owner, 0);
    const b = await ownerNonceSalt(owner, 1);
    expect(a.equals(b)).toBe(false);
  });

  it("differs across owners", async () => {
    const other = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBH";
    const a = await ownerNonceSalt(owner, 0);
    const b = await ownerNonceSalt(other, 0);
    expect(a.equals(b)).toBe(false);
  });
});
