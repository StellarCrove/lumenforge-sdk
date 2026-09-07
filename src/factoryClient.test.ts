import { describe, expect, it } from "vitest";
import {
  iterateVaultsByOwner,
  collectVaultsByOwner,
  deployVaultViaFactory,
  type VaultsByOwnerReader,
  type VaultDeployer,
} from "./factoryClient.js";
import { ownerNonceSalt } from "./salt.js";

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

  it("rejects a non-positive or fractional pageSize/maxPages instead of looping", async () => {
    const reader = fakeReader([[]]);
    await expect(
      collectVaultsByOwner(reader, "GOWNER", { pageSize: 0 }),
    ).rejects.toThrow(/pageSize must be a positive integer/);
    await expect(
      collectVaultsByOwner(reader, "GOWNER", { pageSize: 2.5 }),
    ).rejects.toThrow(/pageSize must be a positive integer/);
    await expect(
      collectVaultsByOwner(reader, "GOWNER", { maxPages: 0 }),
    ).rejects.toThrow(/maxPages must be a positive integer/);
  });

  describe("with a reader that exposes vaults_by_owner_count", () => {
    function countingReader(all: string[]) {
      const calls: Array<{ offset: number; limit: number }> = [];
      const reader: VaultsByOwnerReader & {
        calls: typeof calls;
        countCalls: number;
      } = {
        calls,
        countCalls: 0,
        async vaults_by_owner_count() {
          reader.countCalls++;
          return { result: all.length };
        },
        async vaults_by_owner({ offset, limit }) {
          calls.push({ offset, limit });
          return { result: all.slice(offset, offset + limit) };
        },
      };
      return reader;
    }

    it("reads the count once and stops at exactly that many, no short-page probe", async () => {
      const reader = countingReader(["v1", "v2", "v3", "v4"]);
      const vaults = await collectVaultsByOwner(reader, "GOWNER", { pageSize: 2 });
      expect(vaults).toEqual(["v1", "v2", "v3", "v4"]);
      expect(reader.countCalls).toBe(1);
      // Exactly two page reads for four vaults — no third "is there more?" call.
      expect(reader.calls).toEqual([
        { offset: 0, limit: 2 },
        { offset: 2, limit: 2 },
      ]);
    });

    it("clamps the final page's limit to what's left", async () => {
      const reader = countingReader(["v1", "v2", "v3"]);
      const vaults = await collectVaultsByOwner(reader, "GOWNER", { pageSize: 2 });
      expect(vaults).toEqual(["v1", "v2", "v3"]);
      expect(reader.calls).toEqual([
        { offset: 0, limit: 2 },
        { offset: 2, limit: 1 },
      ]);
    });

    it("yields nothing (and makes no page call) for a zero count", async () => {
      const reader = countingReader([]);
      const vaults = await collectVaultsByOwner(reader, "GOWNER");
      expect(vaults).toEqual([]);
      expect(reader.calls).toEqual([]);
    });

    it("terminates even if the contract under-reports its own count", async () => {
      const reader: VaultsByOwnerReader = {
        async vaults_by_owner_count() {
          return { result: 100 };
        },
        async vaults_by_owner() {
          return { result: [] }; // claims 100 but serves none
        },
      };
      const vaults = await collectVaultsByOwner(reader, "GOWNER", { pageSize: 10 });
      expect(vaults).toEqual([]);
    });
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

describe("deployVaultViaFactory", () => {
  const OWNER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  const TOKEN = "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526";

  function recordingDeployer() {
    const calls: Array<Parameters<VaultDeployer["deploy_vault"]>[0]> = [];
    const factory: VaultDeployer = {
      async deploy_vault(args) {
        calls.push(args);
        return { result: "CDEPLOYEDVAULTADDRESS" } as never;
      },
    };
    return { factory, calls };
  }

  it("passes args through and generates a 32-byte random salt by default", async () => {
    const { factory, calls } = recordingDeployer();
    const tx = await deployVaultViaFactory(factory, {
      owner: OWNER,
      token: TOKEN,
      min_deposit: 100n,
    });
    expect(tx.result).toBe("CDEPLOYEDVAULTADDRESS");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      owner: OWNER,
      token: TOKEN,
      min_deposit: 100n,
      max_balance: undefined,
    });
    expect(calls[0].salt).toHaveLength(32);
  });

  it("two default deploys get different salts", async () => {
    const { factory, calls } = recordingDeployer();
    await deployVaultViaFactory(factory, { owner: OWNER, token: TOKEN, min_deposit: 0n });
    await deployVaultViaFactory(factory, { owner: OWNER, token: TOKEN, min_deposit: 0n });
    expect(Buffer.compare(calls[0].salt, calls[1].salt)).not.toBe(0);
  });

  it("{ nonce } derives the same salt as ownerNonceSalt(owner, nonce)", async () => {
    const { factory, calls } = recordingDeployer();
    await deployVaultViaFactory(
      factory,
      { owner: OWNER, token: TOKEN, min_deposit: 0n },
      { salt: { nonce: 7 } },
    );
    const expected = await ownerNonceSalt(OWNER, 7);
    expect(Buffer.compare(calls[0].salt, expected)).toBe(0);
  });

  it("accepts an explicit 32-byte salt and forwards max_balance", async () => {
    const { factory, calls } = recordingDeployer();
    const salt = Buffer.alloc(32, 9);
    await deployVaultViaFactory(
      factory,
      { owner: OWNER, token: TOKEN, min_deposit: 0n, max_balance: 5_000n },
      { salt },
    );
    expect(Buffer.compare(calls[0].salt, salt)).toBe(0);
    expect(calls[0].max_balance).toBe(5_000n);
  });

  it("rejects a wrong-length explicit salt", async () => {
    const { factory } = recordingDeployer();
    await expect(
      deployVaultViaFactory(
        factory,
        { owner: OWNER, token: TOKEN, min_deposit: 0n },
        { salt: Buffer.alloc(16) },
      ),
    ).rejects.toThrow(/salt must be 32 bytes/);
  });

  it("rejects an invalid nonce (via ownerNonceSalt)", async () => {
    const { factory } = recordingDeployer();
    await expect(
      deployVaultViaFactory(
        factory,
        { owner: OWNER, token: TOKEN, min_deposit: 0n },
        { salt: { nonce: -1 } },
      ),
    ).rejects.toThrow(/safe integer/);
  });
});
