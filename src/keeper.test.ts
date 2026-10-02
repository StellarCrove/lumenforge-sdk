import { Account } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
  batchKeepAlive,
  buildBatchExtendTtlOperation,
  buildBatchExtendTtlOperations,
  buildBatchExtendTtlTransaction,
  DEFAULT_BATCH_SIZE,
  extendTtl,
  extendVaultsByOwnerTtl,
  keepAlive,
  MAX_BATCH_SIZE,
  type TtlExtendable,
  type VaultsByOwnerTtlExtendable,
} from "./keeper.js";

function fakeTarget(
  onExtend?: (args: { threshold: number; extend_to: number }) => void,
): TtlExtendable {
  return {
    async extend_ttl(args) {
      onExtend?.(args);
      return { signAndSend: async () => ({ result: null }) } as never;
    },
  };
}

function fakeIdentifiedTarget(
  id: string,
  opts?: { throwOnExtend?: boolean; throwOnSign?: boolean },
): TtlExtendable & { id: string } {
  return {
    id,
    async extend_ttl() {
      if (opts?.throwOnExtend) throw new Error(`extend_ttl failed: ${id}`);
      return {
        signAndSend: async () => {
          if (opts?.throwOnSign) throw new Error(`signAndSend failed: ${id}`);
          return { result: null };
        },
      } as never;
    },
  };
}

const SAMPLE_CONTRACT_1 =
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const SAMPLE_CONTRACT_2 =
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

describe("extendTtl", () => {
  it("applies default threshold/extendTo when none given", async () => {
    let seen: { threshold: number; extend_to: number } | undefined;
    const target = fakeTarget((args) => (seen = args));
    await extendTtl(target);
    expect(seen).toEqual({ threshold: 17280, extend_to: 518400 });
  });

  it("passes through custom threshold/extendTo", async () => {
    let seen: { threshold: number; extend_to: number } | undefined;
    const target = fakeTarget((args) => (seen = args));
    await extendTtl(target, { threshold: 100, extendTo: 1000 });
    expect(seen).toEqual({ threshold: 100, extend_to: 1000 });
  });

  it("rejects a negative or fractional threshold", async () => {
    const target = fakeTarget();
    await expect(extendTtl(target, { threshold: -1 })).rejects.toThrow(
      /non-negative integer/,
    );
    await expect(extendTtl(target, { threshold: 1.5 })).rejects.toThrow(
      /non-negative integer/,
    );
  });

  it("rejects an extendTo below threshold", async () => {
    const target = fakeTarget();
    await expect(
      extendTtl(target, { threshold: 1000, extendTo: 500 }),
    ).rejects.toThrow(/>= threshold/);
  });
});

describe("extendVaultsByOwnerTtl", () => {
  it("passes owner and resolved options through", async () => {
    let seen: { owner: string; threshold: number; extend_to: number } | undefined;
    const factory: VaultsByOwnerTtlExtendable = {
      async extend_vaults_by_owner_ttl(args) {
        seen = args;
        return { signAndSend: async () => ({ result: null }) } as never;
      },
    };
    await extendVaultsByOwnerTtl(factory, "GOWNER", { threshold: 10, extendTo: 20 });
    expect(seen).toEqual({ owner: "GOWNER", threshold: 10, extend_to: 20 });
  });
});

describe("keepAlive", () => {
  it("extends every target and reports success", async () => {
    const targets = ["a", "b", "c"].map((id) =>
      fakeIdentifiedTarget(id, {}),
    );

    const results = await keepAlive(targets);

    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
    expect(results.length).toBe(3);
  });

  it("isolates one target's failure from the rest", async () => {
    const good = fakeIdentifiedTarget("good");
    const bad = fakeIdentifiedTarget("bad", { throwOnExtend: true });

    const results = await keepAlive([good, bad, good]);

    expect(results.map((r) => r.status)).toEqual(["ok", "error", "ok"]);
    expect(results[1].error).toBeInstanceOf(Error);
  });
});

/* ------------------------------------------------------------------ */
/*  Batch transaction builder tests                                   */
/* ------------------------------------------------------------------ */

describe("batch transaction builder", () => {
  it("exports correct constants", () => {
    expect(MAX_BATCH_SIZE).toBe(100);
    expect(DEFAULT_BATCH_SIZE).toBe(100);
  });

  it("buildBatchExtendTtlOperation creates an invokeHostFunction operation", () => {
    const op = buildBatchExtendTtlOperation(SAMPLE_CONTRACT_1);
    expect(op.body().switch().name).toBe("invokeHostFunction");
  });

  it("buildBatchExtendTtlOperation applies custom options", () => {
    const op = buildBatchExtendTtlOperation(SAMPLE_CONTRACT_1, {
      threshold: 5000,
      extendTo: 200000,
    });
    expect(op.body().switch().name).toBe("invokeHostFunction");
  });

  it("buildBatchExtendTtlOperations creates operations array for contracts", () => {
    const ops = buildBatchExtendTtlOperations([
      SAMPLE_CONTRACT_1,
      SAMPLE_CONTRACT_2,
    ]);
    expect(ops).toHaveLength(2);
    expect(ops[0].body().switch().name).toBe("invokeHostFunction");
    expect(ops[1].body().switch().name).toBe("invokeHostFunction");
  });

  it("buildBatchExtendTtlOperations rejects empty contracts list", () => {
    expect(() => buildBatchExtendTtlOperations([])).toThrow(/must not be empty/);
  });

  it("buildBatchExtendTtlOperations rejects list exceeding MAX_BATCH_SIZE", () => {
    const contracts = Array.from({ length: 101 }, () => SAMPLE_CONTRACT_1);
    expect(() => buildBatchExtendTtlOperations(contracts)).toThrow(/exceeds maximum batch size/);
  });

  it("buildBatchExtendTtlTransaction constructs a valid Stellar Transaction", () => {
    const sourceAccount = new Account(
      "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
      "100",
    );
    const tx = buildBatchExtendTtlTransaction({
      sourceAccount,
      networkPassphrase: "Test SDF Network ; September 2015",
      contractAddresses: [SAMPLE_CONTRACT_1, SAMPLE_CONTRACT_2],
      fee: "200",
      timeout: 60,
    });

    expect(tx.operations).toHaveLength(2);
    expect(Number(tx.fee)).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  batchKeepAlive tests                                              */
/* ------------------------------------------------------------------ */

describe("batchKeepAlive", () => {
  it("returns empty result on empty targets list", async () => {
    const result = await batchKeepAlive([]);
    expect(result).toEqual({ batches: [], results: [] });
  });

  it("bundles targets into a single batch when under batchSize", async () => {
    const targets = ["v1", "v2", "v3"].map((id) => fakeIdentifiedTarget(id));
    const result = await batchKeepAlive(targets);

    expect(result.batches).toHaveLength(1);
    expect(result.batches[0].status).toBe("ok");
    expect(result.batches[0].size).toBe(3);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => r.status === "ok")).toBe(true);
  });

  it("splits into multiple batches when exceeding batchSize", async () => {
    const targets = Array.from({ length: 5 }, (_, i) =>
      fakeIdentifiedTarget(`v${i}`),
    );
    const result = await batchKeepAlive(targets, { batchSize: 2 });

    expect(result.batches).toHaveLength(3);
    expect(result.batches[0].size).toBe(2);
    expect(result.batches[1].size).toBe(2);
    expect(result.batches[2].size).toBe(1);
    expect(result.results).toHaveLength(5);
  });

  it("passes custom threshold and extendTo through", async () => {
    let seen: { threshold: number; extend_to: number } | undefined;
    const target: TtlExtendable = {
      async extend_ttl(args) {
        seen = args;
        return { signAndSend: async () => ({ result: null }) } as never;
      },
    };

    await batchKeepAlive([target], { threshold: 2000, extendTo: 80000 });
    expect(seen).toEqual({ threshold: 2000, extend_to: 80000 });
  });

  it("isolates failures and falls back to individual submissions", async () => {
    let batchAttempted = false;
    const targets = ["v1", "v2"].map((id) => {
      return {
        id,
        async extend_ttl() {
          return {
            signAndSend: async () => {
              if (!batchAttempted) {
                batchAttempted = true;
                throw new Error("batch simulation failed");
              }
              return { result: null };
            },
          } as never;
        },
      };
    });

    const result = await batchKeepAlive(targets, { batchSize: 2 });
    expect(result.batches[0].status).toBe("fallback");
    expect(result.results).toHaveLength(2);
  });

  it("marks individual target errors during fallback", async () => {
    const good = fakeIdentifiedTarget("good");
    const bad = fakeIdentifiedTarget("bad", { throwOnSign: true });

    const result = await batchKeepAlive([good, bad]);
    expect(result.results[0].status).toBe("ok");
    expect(result.results[1].status).toBe("error");
  });

  it("marks batch as error when all targets fail in fallback", async () => {
    const bad1 = fakeIdentifiedTarget("bad1", { throwOnExtend: true });
    const bad2 = fakeIdentifiedTarget("bad2", { throwOnExtend: true });

    const result = await batchKeepAlive([bad1, bad2], { batchSize: 2 });
    expect(result.batches[0].status).toBe("error");
    expect(result.results.every((r) => r.status === "error")).toBe(true);
  });

  it("supports fallbackToIndividual: false", async () => {
    const bad = fakeIdentifiedTarget("bad", { throwOnExtend: true });
    const good = fakeIdentifiedTarget("good");

    const result = await batchKeepAlive([bad, good], {
      fallbackToIndividual: false,
    });

    expect(result.batches[0].status).toBe("error");
    expect(result.results.every((r) => r.status === "error")).toBe(true);
  });

  it("validates batchSize constraints", async () => {
    const t = fakeIdentifiedTarget("t");
    await expect(batchKeepAlive([t], { batchSize: 0 })).rejects.toThrow(
      /positive integer/,
    );
    await expect(batchKeepAlive([t], { batchSize: 101 })).rejects.toThrow(
      /exceed.*100/,
    );
    await expect(batchKeepAlive([t], { batchSize: 2.5 })).rejects.toThrow(
      /positive integer/,
    );
  });

  it("invokes onBatchComplete callback for each batch", async () => {
    const completed: Array<{ index: number; size: number }> = [];
    const targets = Array.from({ length: 4 }, (_, i) =>
      fakeIdentifiedTarget(`t${i}`),
    );

    await batchKeepAlive(targets, {
      batchSize: 2,
      onBatchComplete: (b) => completed.push({ index: b.index, size: b.size }),
    });

    expect(completed).toEqual([
      { index: 0, size: 2 },
      { index: 1, size: 2 },
    ]);
  });

  it("handles exactly 100 targets in a single batch", async () => {
    const targets = Array.from({ length: 100 }, (_, i) =>
      fakeIdentifiedTarget(`t${i}`),
    );
    const result = await batchKeepAlive(targets);

    expect(result.batches).toHaveLength(1);
    expect(result.batches[0].size).toBe(100);
    expect(result.results).toHaveLength(100);
  });

  it("handles 101 targets across 2 batches", async () => {
    const targets = Array.from({ length: 101 }, (_, i) =>
      fakeIdentifiedTarget(`t${i}`),
    );
    const result = await batchKeepAlive(targets);

    expect(result.batches).toHaveLength(2);
    expect(result.batches[0].size).toBe(100);
    expect(result.batches[1].size).toBe(1);
    expect(result.results).toHaveLength(101);
  });
});
