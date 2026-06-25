import { describe, expect, it } from "vitest";
import { LumenVaultClient } from "./client.js";

describe("LumenVaultClient", () => {
  it("constructs without throwing", () => {
    expect(
      () =>
        new LumenVaultClient({
          contractId: "CA".padEnd(56, "A"),
          rpcUrl: "https://soroban-testnet.stellar.org",
        }),
    ).not.toThrow();
  });

  it("builds a deposit operation", () => {
    const client = new LumenVaultClient({
      contractId: "CA".padEnd(56, "A"),
      rpcUrl: "https://soroban-testnet.stellar.org",
    });
    const op = client.buildDepositOperation(
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      100n,
    );
    expect(op).toBeDefined();
  });
});
