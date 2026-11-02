import { describe, expect, it } from "vitest";
import { clearFailures, LOGIN_LIMIT, recordFailure, retryAfterSeconds } from "@/lib/auth/rate-limit";

describe("login rate limiter", () => {
  it("allows attempts until the limit, then blocks", () => {
    const key = "a@b.co|1.2.3.4";
    const now = 1_000_000;
    for (let i = 0; i < LOGIN_LIMIT.maxFailures - 1; i += 1) recordFailure(key, now + i);
    expect(retryAfterSeconds(key, now + 10)).toBe(0);
    recordFailure(key, now + 10);
    expect(retryAfterSeconds(key, now + 20)).toBeGreaterThan(0);
  });

  it("unblocks after the window passes", () => {
    const key = "c@d.co|1.2.3.4";
    const now = 5_000_000;
    for (let i = 0; i < LOGIN_LIMIT.maxFailures; i += 1) recordFailure(key, now);
    expect(retryAfterSeconds(key, now + LOGIN_LIMIT.windowMs + 1)).toBe(0);
  });

  it("clears after a successful login", () => {
    const key = "e@f.co|1.2.3.4";
    for (let i = 0; i < LOGIN_LIMIT.maxFailures; i += 1) recordFailure(key);
    clearFailures(key);
    expect(retryAfterSeconds(key)).toBe(0);
  });
});
