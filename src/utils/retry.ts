/**
 * Retry utility with exponential backoff and decorrelated jitter for transient
 * Soroban RPC network failures (HTTP 429 rate-limiting, 502/503/504 gateway errors,
 * socket timeouts, and transient connection resets).
 */

export interface RetryOptions {
  /** Maximum number of retry attempts before giving up (default: 3). */
  maxRetries?: number;
  /** Initial backoff delay in milliseconds (default: 100ms). */
  baseDelayMs?: number;
  /** Maximum backoff delay cap in milliseconds (default: 3000ms). */
  maxDelayMs?: number;
  /** Optional custom predicate to determine if an error is transient/retryable. */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Inspects an error to determine whether it is a transient Soroban RPC or network error
 * suitable for retrying.
 *
 * Retryable:
 * - HTTP status codes 429 (Too Many Requests), 500, 502, 503, 504
 * - Node/browser network failures: ECONNRESET, ETIMEDOUT, ENOTFOUND, 'fetch failed'
 * - Soroban RPC rate limit strings
 *
 * Non-retryable:
 * - Contract execution failures (host errors, contract assertion errors)
 * - Bad authentication / bad signature errors
 * - Argument validation failures
 */
export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  // Error with explicit HTTP status code
  if (typeof error === "object") {
    const err = error as Record<string, unknown>;
    const status =
      typeof err.status === "number"
        ? err.status
        : typeof err.statusCode === "number"
          ? err.statusCode
          : typeof (err.response as Record<string, unknown> | undefined)?.status === "number"
            ? (err.response as Record<string, unknown>).status
            : undefined;

    if (typeof status === "number") {
      if (status === 429 || (status >= 500 && status <= 504)) {
        return true;
      }
      // Any other explicit 4xx (400, 401, 403, 404, etc.) is NOT transient
      if (status >= 400 && status < 500) {
        return false;
      }
    }

    // Node error code check
    const code = err.code;
    if (
      typeof code === "string" &&
      [
        "ECONNRESET",
        "ETIMEDOUT",
        "ECONNREFUSED",
        "EAI_AGAIN",
        "ENOTFOUND",
        "UND_ERR_CONNECT_TIMEOUT",
        "UND_ERR_SOCKET",
      ].includes(code)
    ) {
      return true;
    }
  }

  // Error message regex search
  const message = error instanceof Error ? error.message : String(error);
  const transientPatterns = [
    /429/i,
    /rate\s*limit/i,
    /too\s*many\s*requests/i,
    /502\s*bad\s*gateway/i,
    /503\s*service\s*unavailable/i,
    /504\s*gateway\s*timeout/i,
    /timeout/i,
    /fetch failed/i,
    /network\s*(error|timeout)/i,
    /connection\s*reset/i,
  ];

  // Explicit non-retryable keywords override
  const nonRetryablePatterns = [
    /HostError/i,
    /ContractError/i,
    /NotInitialized/i,
    /AlreadyInitialized/i,
    /Unauthorized/i,
    /Invalid/i,
  ];

  for (const pattern of nonRetryablePatterns) {
    if (pattern.test(message)) return false;
  }

  return transientPatterns.some((pattern) => pattern.test(message));
}

/**
 * Calculates backoff delay with decorrelated full jitter:
 * delay = Math.random() * Math.min(maxDelayMs, baseDelayMs * 2 ** attempt)
 */
export function calculateBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const ceiling = Math.min(maxDelayMs, exponential);
  return Math.floor(Math.random() * ceiling);
}

/**
 * Wraps an asynchronous operation with retry logic using exponential backoff
 * and decorrelated jitter.
 *
 * @param operation The async function to execute.
 * @param options Configuration for retry attempts and backoff delays.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 100;
  const maxDelayMs = options?.maxDelayMs ?? 3000;
  const checkRetryable = options?.isRetryable ?? isTransientError;

  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries || !checkRetryable(error)) {
        throw error;
      }

      const delay = calculateBackoff(attempt, baseDelayMs, maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }
}
