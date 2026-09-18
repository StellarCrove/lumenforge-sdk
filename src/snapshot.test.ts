import { describe, expect, it } from "vitest";
import {
  getFactorySnapshot,
  getVaultSnapshot,
  type FactoryReader,
  type VaultReader,
} from "./snapshot.js";

function fakeVault(overrides: Partial<VaultReader> = {}): VaultReader {
  return {
    balance: async () => ({ result: 500n }),
    owner: async () => ({ result: "GOWNER" }),
    pending_owner: async () => ({ result: undefined }),
    token: async () => ({ result: "CTOKEN" }),
    min_deposit: async () => ({ result: 0n }),
    max_balance: async () => ({ result: undefined }),
    paused: async () => ({ result: false }),
    ...overrides,
  };
}

describe("getVaultSnapshot", () => {
  it("assembles every field into one object", async () => {
    const snapshot = await getVaultSnapshot(fakeVault());
    expect(snapshot).toEqual({
      balance: 500n,
      owner: "GOWNER",
      pendingOwner: undefined,
      token: "CTOKEN",
      minDeposit: 0n,
      maxBalance: undefined,
      paused: false,
    });
  });

  it("reflects a pending owner and a max balance when set", async () => {
    const snapshot = await getVaultSnapshot(
      fakeVault({
        pending_owner: async () => ({ result: "GPENDING" }),
        max_balance: async () => ({ result: 10_000n }),
        paused: async () => ({ result: true }),
      }),
    );
    expect(snapshot.pendingOwner).toBe("GPENDING");
    expect(snapshot.maxBalance).toBe(10_000n);
    expect(snapshot.paused).toBe(true);
  });

  it("propagates a failure from any individual call", async () => {
    const vault = fakeVault({
      owner: async () => {
        throw new Error("NotInitialized");
      },
    });
    await expect(getVaultSnapshot(vault)).rejects.toThrow("NotInitialized");
  });

  it("issues all calls concurrently rather than sequencing them", async () => {
    const order: string[] = [];
    const vault = fakeVault({
      balance: async () => {
        order.push("balance:start");
        await new Promise((r) => setTimeout(r, 10));
        order.push("balance:end");
        return { result: 1n };
      },
      owner: async () => {
        order.push("owner:start");
        return { result: "GOWNER" };
      },
    });
    await getVaultSnapshot(vault);
    // owner (fast) starts before balance (slow) finishes — proves they
    // ran concurrently, not one-after-another.
    expect(order.indexOf("owner:start")).toBeLessThan(
      order.indexOf("balance:end"),
    );
  });
});

describe("getFactorySnapshot", () => {
  it("assembles vaultCount and vaultWasmHash", async () => {
    const hash = Buffer.from("deadbeef", "hex");
    const factory: FactoryReader = {
      vault_count: async () => ({ result: 3 }),
      vault_wasm_hash: async () => ({ result: hash }),
    };
    const snapshot = await getFactorySnapshot(factory);
    expect(snapshot).toEqual({ vaultCount: 3, vaultWasmHash: hash });
  });

  it("propagates a failure from either call", async () => {
    const factory: FactoryReader = {
      vault_count: async () => ({ result: 0 }),
      vault_wasm_hash: async () => {
        throw new Error("NotInitialized");
      },
    };
    await expect(getFactorySnapshot(factory)).rejects.toThrow(
      "NotInitialized",
    );
  });
});
