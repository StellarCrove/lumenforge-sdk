import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Spec } from "@stellar/stellar-sdk/contract";
import { describe, expect, it } from "vitest";
import { VAULT_ERROR_TYPES, FACTORY_ERROR_TYPES } from "./errors.js";

const fixturesDir = fileURLToPath(new URL("../test/fixtures/", import.meta.url));

function loadSpec(wasmFile: string): Spec {
  const wasm = readFileSync(`${fixturesDir}${wasmFile}`);
  return Spec.fromWasm(wasm);
}

function funcNames(spec: Spec): string[] {
  return spec.funcs().map((f) => f.name().toString());
}

function funcParamNames(spec: Spec, name: string): string[] {
  return spec
    .getFunc(name)
    .inputs()
    .map((i) => i.name().toString());
}

function errorCodes(spec: Spec): number[] {
  return spec
    .errorCases()
    .map((e) => e.value())
    .sort((a, b) => a - b);
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
      "set_min_deposit",
      "set_max_balance",
      "rescue",
      "propose_owner",
      "accept_owner",
      "balance",
      "owner",
      "pending_owner",
      "token",
      "min_deposit",
      "max_balance",
      "paused",
      "extend_ttl",
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it("VAULT_ERROR_TYPES has an entry for every declared error code, and no extras", () => {
    const declared = errorCodes(spec);
    const covered = Object.keys(VAULT_ERROR_TYPES)
      .map(Number)
      .sort((a, b) => a - b);
    expect(covered).toEqual(declared);
  });

  it("has a constructor matching DeployVaultArgs", () => {
    expect(funcParamNames(spec, "__constructor")).toEqual([
      "owner",
      "token",
      "min_deposit",
      "max_balance",
    ]);
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

  it("FACTORY_ERROR_TYPES has an entry for every declared error code, and no extras", () => {
    const declared = errorCodes(spec);
    const covered = Object.keys(FACTORY_ERROR_TYPES)
      .map(Number)
      .sort((a, b) => a - b);
    expect(covered).toEqual(declared);
  });

  it("deploy_vault takes token/min_deposit/max_balance alongside owner/salt", () => {
    expect(funcParamNames(spec, "deploy_vault")).toEqual([
      "owner",
      "token",
      "min_deposit",
      "max_balance",
      "salt",
    ]);
  });

  it("vaults_by_owner is paginated", () => {
    expect(funcParamNames(spec, "vaults_by_owner")).toEqual([
      "owner",
      "offset",
      "limit",
    ]);
  });

  it("extend_vaults_by_owner_ttl returns a Result (declares an error case)", () => {
    // A void-returning function has no error outputs; this one now does.
    expect(spec.getFunc("extend_vaults_by_owner_ttl").outputs().length).toBeGreaterThan(0);
  });
});
