import { describe, expect, it, vi } from "vitest";
import {
  calculateBackoff,
  isTransientError,
  withRetry,
  type RetryOptions,
} from "./retry.js";

describe("isTransientError", () => {
  it("recognizes HTTP status 429 as transient", () => {
    expect(isTransientError({ status: 429 })).toBe(true);
    expect(isTransientError({ statusCode: 429 })).toBe(true);
    expect(isTransientError({ response: { status: 429 } })).toBe(true);
    expect(isTransientError(new Error("Rate limit exceeded 429"))).toBe(true);
  });

  it("recognizes 502, 503, 504 server errors as transient", () => {
    expect(isTransientError({ status: 502 })).toBe(true);
    expect(isTransientError({ status: 503 })).toBe(true);
    expect(isTransientError({ status: 504 })).toBe(true);
    expect(isTransientError(new Error("503 Service Unavailable"))).toBe(true);
  });

  it("recognizes network level codes as transient", () => {
    expect(isTransientError({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientError({ code: "ETIMEDOUT" })).toBe(true);
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
    expect(isTransientError(new Error("network timeout"))).toBe(true);
  });

  it("rejects non-retryable contract errors immediately", () => {
    expect(isTransientError(new Error("HostError: Error(Contract, #1)"))).toBe(false);
    expect(isTransientError(new Error("NotInitialized"))).toBe(false);
    expect(isTransientError(new Error("Unauthorized"))).toBe(false);
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError({ status: 401 })).toBe(false);
    expect(isTransientError({ status: 404 })).toBe(false);
  });
});

describe("calculateBackoff", () => {
  it("produces values between 0 and bounded ceiling with jitter", () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const delay = calculateBackoff(attempt, 50, 500);
      const maxPossible = Math.min(500, 50 * Math.pow(2, attempt));
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(maxPossible);
    }
  });
});

describe("withRetry", () => {
  it("returns operation result on first attempt without delay", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await withRetry(fn);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient failure and resolves when subsequent attempt succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Rate limit exceeded 429"))
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValue("recovered");

    const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 5 });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("fails immediately without retry on non-transient errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("NotInitialized"));
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow("NotInitialized");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exhausts maxRetries and throws last error", async () => {
    const err = new Error("429 Too Many Requests");
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 }),
    ).rejects.toThrow("429 Too Many Requests");

    // initial attempt + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("respects custom isRetryable predicate", async () => {
    const customPredicate = (err: unknown) => (err as Error).message.includes("custom_transient");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("custom_transient_failure"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, {
      isRetryable: customPredicate,
      baseDelayMs: 1,
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
