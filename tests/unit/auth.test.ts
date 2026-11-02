import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signSessionToken, verifySessionToken } from "@/lib/auth/token";
import { loginSchema, registerSchema } from "@/lib/validation/auth";

describe("registerSchema", () => {
  it("accepts a valid registration and normalizes the email", () => {
    const result = registerSchema.parse({ fullName: "  Asha Rao ", email: "Asha@Example.COM", password: "secret123" });
    expect(result).toEqual({ fullName: "Asha Rao", email: "asha@example.com", password: "secret123" });
  });

  it.each([
    ["short password", { fullName: "Asha", email: "a@b.co", password: "abc1" }],
    ["no digit", { fullName: "Asha", email: "a@b.co", password: "abcdefgh" }],
    ["no letter", { fullName: "Asha", email: "a@b.co", password: "12345678" }],
    ["bad email", { fullName: "Asha", email: "not-an-email", password: "secret123" }],
    ["one-letter name", { fullName: "A", email: "a@b.co", password: "secret123" }],
  ])("rejects %s", (_label, input) => {
    expect(registerSchema.safeParse(input).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("requires a password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("password hashing", () => {
  it("produces a bcrypt hash that verifies only the right password", async () => {
    const hash = await hashPassword("secret123");
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("secret124", hash)).toBe(false);
  });
});

describe("session tokens", () => {
  const user = { userId: 7, name: "Asha", email: "asha@example.com", role: "admin" as const };

  it("round-trips a signed token", async () => {
    const token = await signSessionToken(user);
    expect(await verifySessionToken(token)).toEqual(user);
  });

  it("rejects a tampered token", async () => {
    const token = await signSessionToken(user);
    const [header, payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), role: "admin", sub: "1" })).toString("base64url");
    expect(await verifySessionToken(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it("returns null for a missing token", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
  });
});
