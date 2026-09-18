import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CliError,
  fail,
  getNetwork,
  getReadOnlyPublicKey,
  optionalBigint,
  optionalIntArg,
  requiredArg,
  requiredBigintArg,
  requiredIntArg,
  requireEnv,
} from "./cli.js";

// This file only imports and calls the exported pure helpers, never
// `main()` — `main()` reads real `process.argv`/network state and can
// call `process.exitCode`, which isn't something a unit test should
// exercise. The `isDirectRun` guard at the bottom of cli.ts ensures this
// import alone never parses argv or runs a command.

const ENV_KEYS = [
  "LUMENFORGE_RPC_URL",
  "LUMENFORGE_NETWORK_PASSPHRASE",
  "LUMENFORGE_SECRET_KEY",
] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("fail / CliError", () => {
  it("throws a CliError carrying the message", () => {
    expect(() => fail("boom")).toThrow(CliError);
    expect(() => fail("boom")).toThrow("boom");
  });
});

describe("requireEnv", () => {
  it("returns the value when set", () => {
    process.env.LUMENFORGE_RPC_URL = "https://example.test";
    expect(requireEnv("LUMENFORGE_RPC_URL")).toBe("https://example.test");
  });

  it("fails cleanly when unset", () => {
    expect(() => requireEnv("LUMENFORGE_RPC_URL")).toThrow(
      /missing required environment variable LUMENFORGE_RPC_URL/,
    );
  });
});

describe("getNetwork", () => {
  it("auto-detects allowHttp from an http:// URL", () => {
    process.env.LUMENFORGE_RPC_URL = "http://localhost:8000";
    process.env.LUMENFORGE_NETWORK_PASSPHRASE = "Standalone";
    expect(getNetwork()).toEqual({
      rpcUrl: "http://localhost:8000",
      networkPassphrase: "Standalone",
      allowHttp: true,
    });
  });

  it("never sets allowHttp for an https:// URL", () => {
    process.env.LUMENFORGE_RPC_URL = "https://soroban-testnet.stellar.org";
    process.env.LUMENFORGE_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
    expect(getNetwork().allowHttp).toBe(false);
  });

  it("fails if LUMENFORGE_RPC_URL is unset", () => {
    process.env.LUMENFORGE_NETWORK_PASSPHRASE = "Standalone";
    expect(() => getNetwork()).toThrow(/LUMENFORGE_RPC_URL/);
  });
});

describe("getReadOnlyPublicKey", () => {
  const secret = "SCX5NPFE2L36P3FS6TDABSP63A2JTLV2C34JYTPR65ZIJYCNHMT5NPRA";

  it("prefers an explicit --public-key", () => {
    expect(getReadOnlyPublicKey("GEXPLICIT")).toBe("GEXPLICIT");
  });

  it("derives from LUMENFORGE_SECRET_KEY when no explicit key is given", () => {
    process.env.LUMENFORGE_SECRET_KEY = secret;
    const derived = getReadOnlyPublicKey(undefined);
    expect(derived.startsWith("G")).toBe(true);
  });

  it("fails cleanly when neither is available", () => {
    expect(() => getReadOnlyPublicKey(undefined)).toThrow(
      /pass --public-key, or set LUMENFORGE_SECRET_KEY/,
    );
  });
});

describe("requiredArg", () => {
  it("returns the value when present", () => {
    expect(requiredArg("contract", "C123")).toBe("C123");
  });

  it("fails cleanly when missing", () => {
    expect(() => requiredArg("contract", undefined)).toThrow(
      /missing required --contract/,
    );
  });
});

describe("requiredBigintArg / optionalBigint", () => {
  it("parses a valid integer string", () => {
    expect(requiredBigintArg("amount", "500")).toBe(500n);
  });

  it("fails with a clean message on non-numeric input, not a raw SyntaxError", () => {
    expect(() => requiredBigintArg("amount", "abc")).toThrow(
      /--amount must be an integer, got "abc"/,
    );
  });

  it("fails on a decimal amount", () => {
    expect(() => requiredBigintArg("amount", "10.5")).toThrow(
      /--amount must be an integer, got "10.5"/,
    );
  });

  it("fails on a missing required amount", () => {
    expect(() => requiredBigintArg("amount", undefined)).toThrow(
      /missing required --amount/,
    );
  });

  it("optionalBigint passes through undefined without erroring", () => {
    expect(optionalBigint("max-balance", undefined)).toBeUndefined();
  });

  it("optionalBigint still validates a given value", () => {
    expect(() => optionalBigint("max-balance", "nope")).toThrow(
      /--max-balance must be an integer/,
    );
  });
});

describe("requiredIntArg", () => {
  it("parses a valid non-negative integer", () => {
    expect(requiredIntArg("start-ledger", "123456")).toBe(123456);
  });

  it("fails cleanly on non-numeric input instead of producing NaN", () => {
    expect(() => requiredIntArg("start-ledger", "abc")).toThrow(
      /--start-ledger must be a non-negative integer, got "abc"/,
    );
  });

  it("fails on a negative value", () => {
    expect(() => requiredIntArg("start-ledger", "-5")).toThrow(
      /--start-ledger must be a non-negative integer/,
    );
  });

  it("fails on a fractional value", () => {
    expect(() => requiredIntArg("start-ledger", "1.5")).toThrow(
      /--start-ledger must be a non-negative integer/,
    );
  });
});

describe("optionalIntArg", () => {
  it("returns undefined when absent", () => {
    expect(optionalIntArg("threshold", undefined)).toBeUndefined();
  });

  it("parses zero correctly (falsy but present)", () => {
    expect(optionalIntArg("threshold", "0")).toBe(0);
  });

  it("parses a negative integer (threshold/extendTo don't reject negatives here — extendTtl does)", () => {
    expect(optionalIntArg("threshold", "-5")).toBe(-5);
  });

  it("fails cleanly on non-numeric input", () => {
    expect(() => optionalIntArg("threshold", "abc")).toThrow(
      /--threshold must be an integer, got "abc"/,
    );
  });

  it("fails on a fractional value", () => {
    expect(() => optionalIntArg("threshold", "1.5")).toThrow(
      /--threshold must be an integer/,
    );
  });
});
