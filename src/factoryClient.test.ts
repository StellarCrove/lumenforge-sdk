import { describe, expect, it } from "vitest";
import {
  iterateVaultsByOwner,
  collectVaultsByOwner,
  type VaultsByOwnerReader,
} from "./factoryClient.js";

function fakeReader(pages: string[][]): VaultsByOwnerReader {
  return {
    async vaults_by_owner({ offset, limit }) {
      const page = pages[Math.floor(offset / limit)] ?? [];
      return { result: page };
    },
  };
}

describe("iterateVaultsByOwner / collectVaultsByOwner", () => {
  it("iterateVaultsByOwner is a lazy generator — consumers can stop early without fetching further pages", async () => {
    const calls: Array<{ offset: number; limit: number }> = [];
    const reader: VaultsByOwnerReader = {
      async vaults_by_owner({ offset, limit }) {
        calls.push({ offset, limit });
        return { result: [`v${offset}a`, `v${offset}b`] }; // always a full page
      },
    };

    const seen: string[] = [];
    for await (const vault of iterateVaultsByOwner(reader, "GOWNER", { pageSize: 2 })) {
      seen.push(vault);
      if (seen.length === 3) break;
    }

    expect(seen).toEqual(["v0a", "v0b", "v2a"]);
    // Only the two pages needed to produce 3 items were fetched — a third
    // page was never requested.
    expect(calls).toEqual([
      { offset: 0, limit: 2 },
      { offset: 2, limit: 2 },
    ]);
  });

  it("yields nothing for an owner with no vaults", async () => {
    const reader = fakeReader([[]]);
    const vaults = await collectVaultsByOwner(reader, "GOWNER", { pageSize: 2 });
    expect(vaults).toEqual([]);
  });

  it("returns everything from a single short page", async () => {
    const reader = fakeReader([["v1", "v2"]]);
    const vaults = await collectVaultsByOwner(reader, "GOWNER", { pageSize: 5 });
    expect(vaults).toEqual(["v1", "v2"]);
  });

  it("pages through multiple full pages and stops at the first short one", async () => {
    const reader = fakeReader([
      ["v1", "v2"],
      ["v3", "v4"],
      ["v5"], // short page — signals the end
      ["v6", "v7"], // must never be reached
    ]);
    const vaults = await collectVaultsByOwner(reader, "GOWNER", { pageSize: 2 });
    expect(vaults).toEqual(["v1", "v2", "v3", "v4", "v5"]);
  });

  it("stops exactly at a page boundary when the last full page is followed by empty", async () => {
    const reader = fakeReader([
      ["v1", "v2"],
      [], // empty page after an exact-multiple total — also a valid end signal
    ]);
    const vaults = await collectVaultsByOwner(reader, "GOWNER", { pageSize: 2 });
    expect(vaults).toEqual(["v1", "v2"]);
  });

  it("rejects a non-positive pageSize instead of looping", async () => {
    const reader = fakeReader([[]]);
    await expect(
      collectVaultsByOwner(reader, "GOWNER", { pageSize: 0 }),
    ).rejects.toThrow(/pageSize must be positive/);
  });

  it("never loops forever against a contract that always returns full pages — throws at maxPages instead", async () => {
    // Simulates a misbehaving/malicious contract: every page is exactly
    // `limit` long, so the "short page = done" signal never fires.
    const reader: VaultsByOwnerReader = {
      async vaults_by_owner({ limit }) {
        return { result: Array.from({ length: limit }, (_, i) => `v${i}`) };
      },
    };

    const start = Date.now();
    await expect(
      collectVaultsByOwner(reader, "GOWNER", { pageSize: 3, maxPages: 5 }),
    ).rejects.toThrow(/hit maxPages \(5\)/);
    // This is the actual "doesn't hang" assertion: with a bug the await
    // above would never resolve and the test would time out instead of
    // failing fast here.
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("passes offset/limit through correctly across pages", async () => {
    const calls: Array<{ offset: number; limit: number }> = [];
    const reader: VaultsByOwnerReader = {
      async vaults_by_owner({ offset, limit }) {
        calls.push({ offset, limit });
        return { result: offset === 0 ? ["v1", "v2"] : ["v3"] };
      },
    };

    await collectVaultsByOwner(reader, "GOWNER", { pageSize: 2 });
    expect(calls).toEqual([
      { offset: 0, limit: 2 },
      { offset: 2, limit: 2 },
    ]);
  });
});
