import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applicationSubmitSchema,
  generateRegistrationId,
  generateRawAccessToken,
  hashAccessToken,
  verifyAccessTokenCredential,
  StudentClaimError,
  linkApplicationToUser,
  isPrismaUniqueError,
  isValidBirthDate,
  stripInvisibleCharacters,
  stripLeadingAt,
  INPUT_LIMITS,
} from "@/lib/application-service";

const SERVICE_SRC = readFileSync(
  "D:/Dev/Projects/bareskrim-rekrutmen-v2/src/lib/application-service.ts",
  "utf-8"
);
const ROUTE_SRC = readFileSync(
  "D:/Dev/Projects/bareskrim-rekrutmen-v2/src/app/api/applications/route.ts",
  "utf-8"
);

describe("Application Service — Unit Tests", () => {
  it("strips invisible characters and leading @", () => {
    expect(stripInvisibleCharacters("  Budi\u200B  Santoso  ")).toBe("Budi Santoso");
    expect(stripLeadingAt("@budi_reskrim")).toBe("budi_reskrim");
  });

  it("validates application submit schema correctly", () => {
    const validData = {
      fullName: "Budi Santoso",
      robloxUsername: "BudiReskrim_01",
      discordId: "@budi_reskrim",
      birthDate: "2005-08-17",
      gender: "L",
      origin: "Ternate",
      experience: "Pengalaman 2 tahun di POLRI RBX sebagai penyidik.",
      motivation: "Ingin bergabung dengan Pusdik Reserse untuk berkembang.",
      agreement: true,
    };

    const parsed = applicationSubmitSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.discordId).toBe("budi_reskrim");
    }
  });

  it("rejects invalid inputs", () => {
    const invalidData = {
      fullName: "Bu", // too short
      robloxUsername: "Budi@Invalid", // invalid chars
      discordId: "b",
      birthDate: "invalid-date",
      gender: "X",
      origin: "T",
      experience: "short",
      motivation: "short",
      agreement: false,
    };

    const parsed = applicationSubmitSchema.safeParse(invalidData);
    expect(parsed.success).toBe(false);
  });

  it("validates birth date range (1950..now)", () => {
    expect(isValidBirthDate("2005-08-17")).toBe(true);
    expect(isValidBirthDate("1900-01-01")).toBe(false); // sebelum 1950
    expect(isValidBirthDate("2999-01-01")).toBe(false); // masa depan
    expect(isValidBirthDate("not-a-date")).toBe(false);
  });

  it("validates input length limits", () => {
    const longName = "a".repeat(INPUT_LIMITS.fullName.max + 1);
    const parsed = applicationSubmitSchema.safeParse({
      fullName: longName,
      robloxUsername: "BudiReskrim_01",
      discordId: "budi",
      birthDate: "2005-08-17",
      gender: "L",
      origin: "Ternate",
      experience: "Pengalaman roleplay yang cukup panjang sekali.",
      motivation: "Motivasi mengikuti pendidikan Pusdik Reserse.",
      agreement: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("generates registration IDs: 6-char base32, dynamic prefix, no ambiguity", () => {
    for (let i = 0; i < 100; i++) {
      const regId = generateRegistrationId();
      // Format: XLI-02-XXXXXX (6 karakter base32 tanpa 0/O/1/I)
      expect(regId).toMatch(/^XLI-02-[A-HJ-NP-Z2-9]{6}$/);
      const suffix = regId.slice("XLI-02-".length);
      expect(suffix).toHaveLength(6);
      expect(suffix).not.toMatch(/[0O1I]/);
    }
    // Prefix dinamis dari RecruitmentPeriod.code
    expect(generateRegistrationId("XLI-03")).toMatch(/^XLI-03-[A-HJ-NP-Z2-9]{6}$/);
  });

  it("registration IDs unique across calls (30-bit space)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) ids.add(generateRegistrationId());
    expect(ids.size).toBe(200);
  });

  it("generates access tokens with ≥128-bit entropy format (32 char base32)", () => {
    const token = generateRawAccessToken();
    // Format visual dipertahankan: XLI-02-XXXX-XXXX-... (8 grup × 4)
    expect(token).toMatch(/^XLI-02(-[A-HJ-NP-Z2-9]{4}){8}$/);
    // 32 char base32 = 160 bit entropi (≥128 bit minimum)
    const payload = token.replace("XLI-02-", "").replace(/-/g, "");
    expect(payload).toHaveLength(32);
  });

  it("tokens are unique across calls", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 200; i++) tokens.add(generateRawAccessToken());
    expect(tokens.size).toBe(200);
  });

  it("hashes tokens with SHA-256; token and hash differ", () => {
    const rawToken = generateRawAccessToken();
    const hash1 = hashAccessToken(rawToken);
    const hash2 = hashAccessToken(rawToken);
    expect(hash1).toHaveLength(64); // SHA-256 hex string length
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(rawToken);
  });

  it("detects Prisma unique errors (P2002)", () => {
    expect(isPrismaUniqueError({ code: "P2002" })).toBe(true);
    expect(isPrismaUniqueError({ code: "P2025" })).toBe(false);
    expect(isPrismaUniqueError(new Error("boom"))).toBe(false);
  });

  it("static security: no Math.random in credential code", () => {
    expect(SERVICE_SRC).not.toMatch(/Math\.random/);
  });

  it("static security: route logs never print token/hash material", () => {
    expect(ROUTE_SRC).not.toMatch(/console\.(log|info|debug|warn)/);
    expect(ROUTE_SRC).not.toMatch(/console\.error\(.*rawAccessToken/);
  });

  describe("TASK 03L.1 — Student Claim Helpers Unit Tests", () => {
    it("verifies timing-safe access token credential correctly", () => {
      const rawToken = generateRawAccessToken();
      const hash = hashAccessToken(rawToken);

      // Matching raw token & hash
      expect(verifyAccessTokenCredential(rawToken, hash)).toBe(true);

      // Mismatched token
      const wrongToken = generateRawAccessToken();
      expect(verifyAccessTokenCredential(wrongToken, hash)).toBe(false);

      // Empty or invalid inputs
      expect(verifyAccessTokenCredential("", hash)).toBe(false);
      expect(verifyAccessTokenCredential(rawToken, "")).toBe(false);
    });

    it("links unlinked application to user atomically", async () => {
      const mockApp = {
        id: "app_123",
        robloxUsernameKey: "budi_roblox",
        userId: null,
        status: "MENUNGGU_VERIFIKASI",
      };

      const mockTx = {
        application: {
          findUnique: async () => ({ ...mockApp }),
          updateMany: async ({ data }: any) => {
            mockApp.userId = data.userId;
            return { count: 1 };
          },
        },
      };

      const result = await linkApplicationToUser(mockTx as any, {
        applicationId: "app_123",
        userId: "usr_456",
        robloxUsername: "Budi_Roblox",
      });

      expect(result.success).toBe(true);
      expect(result.isAlreadyLinked).toBe(false);
      expect(mockApp.userId).toBe("usr_456");
      // Verify ApplicationStatus remained MENUNGGU_VERIFIKASI
      expect(mockApp.status).toBe("MENUNGGU_VERIFIKASI");
    });

    it("handles idempotent claim when linked to the same user", async () => {
      const mockApp = {
        id: "app_123",
        robloxUsernameKey: "budi_roblox",
        userId: "usr_456",
        status: "MENUNGGU_VERIFIKASI",
      };

      const mockTx = {
        application: {
          findUnique: async () => ({ ...mockApp }),
          updateMany: async () => ({ count: 0 }),
        },
      };

      const result = await linkApplicationToUser(mockTx as any, {
        applicationId: "app_123",
        userId: "usr_456", // Same user
        robloxUsername: "budi_roblox",
      });

      expect(result.success).toBe(true);
      expect(result.isAlreadyLinked).toBe(true);
    });

    it("rejects claim when application is already linked to a DIFFERENT user", async () => {
      const mockApp = {
        id: "app_123",
        robloxUsernameKey: "budi_roblox",
        userId: "usr_OTHER",
        status: "MENUNGGU_VERIFIKASI",
      };

      const mockTx = {
        application: {
          findUnique: async () => ({ ...mockApp }),
          updateMany: async () => ({ count: 0 }),
        },
      };

      await expect(
        linkApplicationToUser(mockTx as any, {
          applicationId: "app_123",
          userId: "usr_456",
          robloxUsername: "budi_roblox",
        })
      ).rejects.toThrowError(StudentClaimError);
    });

    it("rejects claim when roblox username does not match application key", async () => {
      const mockApp = {
        id: "app_123",
        robloxUsernameKey: "budi_roblox",
        userId: null,
        status: "MENUNGGU_VERIFIKASI",
      };

      const mockTx = {
        application: {
          findUnique: async () => ({ ...mockApp }),
          updateMany: async () => ({ count: 1 }),
        },
      };

      await expect(
        linkApplicationToUser(mockTx as any, {
          applicationId: "app_123",
          userId: "usr_456",
          robloxUsername: "Siti_Different_Roblox",
        })
      ).rejects.toThrow(StudentClaimError);
    });

    it("handles concurrent claim race condition gracefully", async () => {
      let fetchCount = 0;
      const mockApp = {
        id: "app_123",
        robloxUsernameKey: "budi_roblox",
        userId: null as string | null,
        status: "MENUNGGU_VERIFIKASI",
      };

      const mockTx = {
        application: {
          findUnique: async () => {
            fetchCount++;
            if (fetchCount === 1) return { ...mockApp };
            // Second fetch after updateMany returns 0 (simulates race condition)
            return { ...mockApp, userId: "usr_456" };
          },
          updateMany: async () => ({ count: 0 }), // 0 count due to concurrent update
        },
      };

      const result = await linkApplicationToUser(mockTx as any, {
        applicationId: "app_123",
        userId: "usr_456",
        robloxUsername: "budi_roblox",
      });

      expect(result.success).toBe(true);
      expect(result.isAlreadyLinked).toBe(true);
    });
  });
});
