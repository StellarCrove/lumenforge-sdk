import { describe, expect, it } from "vitest";
import {
  extendTtl,
  extendVaultsByOwnerTtl,
  keepAlive,
  type TtlExtendable,
  type VaultsByOwnerTtlExtendable,
} from "./keeper.js";

function fakeTarget(
  onExtend?: (args: { threshold: number; extend_to: number }) => void,
): TtlExtendable {
  return {
    async extend_ttl(args) {
      onExtend?.(args);
      // Minimal AssembledTransaction stand-in — only signAndSend is used.
      return { signAndSend: async () => ({ result: null }) } as never;
    },
  };
}

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
    const calls: string[] = [];
    const targets: (TtlExtendable & { id: string })[] = ["a", "b", "c"].map(
      (id) => ({
        id,
        async extend_ttl() {
          calls.push(id);
          return { signAndSend: async () => ({ result: null }) } as never;
        },
      }),
    );

    const results = await keepAlive(targets);

    expect(calls).toEqual(["a", "b", "c"]);
    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
  });

  it("isolates one target's failure from the rest", async () => {
    const good: TtlExtendable & { id: string } = {
      id: "good",
      async extend_ttl() {
        return { signAndSend: async () => ({ result: null }) } as never;
      },
    };
    const bad: TtlExtendable & { id: string } = {
      id: "bad",
      async extend_ttl() {
        throw new Error("boom");
      },
    };

    const results = await keepAlive([good, bad, good]);

    expect(results.map((r) => r.status)).toEqual(["ok", "error", "ok"]);
    expect(results[1].error).toBeInstanceOf(Error);
  });
});
