import { describe, it, expect } from "vitest";
import { createRateLimiter, clientIp } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("mengizinkan request dalam batas max", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    expect(limiter.check("ip1").ok).toBe(true);
    expect(limiter.check("ip1").ok).toBe(true);
    expect(limiter.check("ip1").ok).toBe(true);
    expect(limiter.check("ip1").ok).toBe(false);
  });

  it("menghitung retryAfterSeconds saat diblokir", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    limiter.check("ip");
    limiter.check("ip");
    const result = limiter.check("ip");
    expect(result.ok).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("key yang berbeda tidak saling mempengaruhi", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    limiter.check("a");
    expect(limiter.check("a").ok).toBe(false);
    expect(limiter.check("b").ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("mengambil IP paling kanan dari x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientIp(req)).toBe("5.6.7.8");
  });

  it("fallback ke x-real-ip bila tidak ada forwarded", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "10.0.0.1" },
    });
    expect(clientIp(req)).toBe("10.0.0.1");
  });

  it("fallback 'unknown' bila tidak ada header", () => {
    expect(clientIp(new Request("http://localhost"))).toBe("unknown");
  });
});
