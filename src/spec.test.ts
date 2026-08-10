import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Spec } from "@stellar/stellar-sdk/contract";
import { describe, expect, it } from "vitest";

const fixturesDir = fileURLToPath(new URL("../test/fixtures/", import.meta.url));

function loadSpec(wasmFile: string): Spec {
  const wasm = readFileSync(`${fixturesDir}${wasmFile}`);
  return Spec.fromWasm(wasm);
}

function funcNames(spec: Spec): string[] {
  return spec.funcs().map((f) => f.name().toString());
}

describe("lumen_vault spec", () => {
  const spec = loadSpec("lumen_vault.wasm");
  const names = funcNames(spec);

  it("exposes every method declared in VaultMethods", () => {
    const expected = [
      "deposit",
      "withdraw",
      "pause",
      "unpause",
      "propose_owner",
      "accept_owner",
      "balance",
      "owner",
      "pending_owner",
      "paused",
      "extend_ttl",
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it("declares the error codes VAULT_ERROR_TYPES expects", () => {
    const codes = spec.errorCases().map((e) => e.value());
    expect(codes.sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("lumen_vault_factory spec", () => {
  const spec = loadSpec("lumen_vault_factory.wasm");
  const names = funcNames(spec);

  it("exposes every method declared in FactoryMethods", () => {
    const expected = [
      "deploy_vault",
      "vault_count",
      "vaults_by_owner",
      "vault_wasm_hash",
      "extend_ttl",
      "extend_vaults_by_owner_ttl",
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it("declares the error codes FACTORY_ERROR_TYPES expects", () => {
    const codes = spec.errorCases().map((e) => e.value());
    expect(codes.sort()).toEqual([1]);
  });
});
