import { describe, expect, it, vi } from "vitest";
import {
  getFactorySnapshot,
  getVaultSnapshot,
  type FactoryReader,
  type VaultReader,
} from "./snapshot.js";
import {
  readAllowances,
  setAllowance,
  setAllowancesEnabled,
} from "./vaultClient.js";

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

  it("reflects allowancesEnabled when vault supports it", async () => {
    const snapshot = await getVaultSnapshot(
      fakeVault({
        allowances_enabled: async () => ({ result: true }),
      }),
    );
    expect(snapshot.allowancesEnabled).toBe(true);
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

  it("recovers from transient RPC error and successfully returns snapshot", async () => {
    let attempts = 0;
    const vault = fakeVault({
      balance: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error("HTTP 429 Too Many Requests");
        }
        return { result: 1000n };
      },
    });
    const snapshot = await getVaultSnapshot(vault, {
      retry: { baseDelayMs: 1, maxDelayMs: 5 },
    });
    expect(snapshot.balance).toBe(1000n);
    expect(attempts).toBe(2);
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

describe("readAllowances / setAllowance / setAllowancesEnabled", () => {
  it("reads enabled state, members list, and per-member remaining allowances", async () => {
    const allowances: Record<string, bigint> = {
      GALICE: 500n,
      GBOB: 1200n,
    };
    const reader = {
      allowances_enabled: async () => ({ result: true }),
      allowance_members: async () => ({ result: ["GALICE", "GBOB"] }),
      allowance: async ({ depositor }: { depositor: string }) => ({
        result: allowances[depositor] ?? 0n,
      }),
    };

    const view = await readAllowances(reader);
    expect(view).toEqual({
      enabled: true,
      members: ["GALICE", "GBOB"],
      remaining: {
        GALICE: 500n,
        GBOB: 1200n,
      },
    });
  });

  it("setAllowance rejects negative amounts before calling the contract", async () => {
    const set_allowance = vi.fn();
    await expect(
      setAllowance({ set_allowance }, "GALICE", -1n),
    ).rejects.toThrow(/amount must be non-negative/);
    expect(set_allowance).not.toHaveBeenCalled();
  });

  it("setAllowance and setAllowancesEnabled forward arguments to the contract", async () => {
    const set_allowance = vi.fn().mockResolvedValue({ result: null });
    const set_allowances_enabled = vi.fn().mockResolvedValue({ result: null });

    await setAllowance({ set_allowance }, "GALICE", 100n);
    expect(set_allowance).toHaveBeenCalledWith(
      { depositor: "GALICE", amount: 100n },
      undefined,
    );

    await setAllowancesEnabled({ set_allowances_enabled }, true);
    expect(set_allowances_enabled).toHaveBeenCalledWith(
      { enabled: true },
      undefined,
    );
  });
});
