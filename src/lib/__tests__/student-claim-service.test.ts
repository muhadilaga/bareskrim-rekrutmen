import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { hashAccessToken, verifyAccessTokenCredential, StudentClaimError } from "../application-service";
import { claimApplicationForUser, studentClaimSchema } from "../student-claim-service";

const token = "SYNTHETIC-CLAIM-CREDENTIAL";
const actor = { id: "owner-a", username: "CasisTest", deletedAt: null };
const input = { registrationId: "SYNTHETIC-REG", accessToken: token };
function record() {
  return { id: "application-a", userId: null as string | null, verifiedAt: null as Date | null,
    updatedAt: new Date("2026-01-01"), deletedAt: null as Date | null,
    robloxUsernameKey: "casistest", accessTokenHash: hashAccessToken(token),
    recruitmentPeriod: { deletedAt: null as Date | null, isActive: false },
    status: "MENUNGGU_VERIFIKASI" };
}
function database(initial: ReturnType<typeof record> | null = record()) {
  let row = initial;
  const application = {
    findUnique: vi.fn(async () => row ? structuredClone(row) : null),
    updateMany: vi.fn(async ({ where, data }: any) => {
      if (!row || row.userId !== null || row.verifiedAt !== null || row.deletedAt !== null ||
        row.recruitmentPeriod.deletedAt !== null || row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
      row = { ...row, ...data, updatedAt: new Date("2026-02-01") };
      return { count: 1 };
    }),
  };
  const db = { $transaction: vi.fn(async (fn: any) => fn({ application })) };
  return { db: db as unknown as Parameters<typeof claimApplicationForUser>[0], application,
    read: () => row, set: (value: typeof row) => { row = value; } };
}

describe("claim credentials and server input", () => {
  it("compares fixed-size binary digests, including dummy digests", () => {
    const compare = vi.spyOn(crypto, "timingSafeEqual");
    try {
      expect(verifyAccessTokenCredential(token, hashAccessToken(token).toUpperCase())).toBe(true);
      for (const bad of ["", "g".repeat(64), "ab", "a".repeat(65)]) expect(verifyAccessTokenCredential(token, bad)).toBe(false);
      expect(compare).toHaveBeenCalledTimes(5);
      for (const [left, right] of compare.mock.calls) {
        expect(left.byteLength).toBe(32); expect(right.byteLength).toBe(32);
      }
    } finally { compare.mockRestore(); }
  });
  it.each([
    {}, { ...input, userId: "attacker" }, { ...input, username: "attacker" },
    { ...input, accessToken: [token] }, { ...input, registrationId: null },
    { ...input, registrationId: " " }, { ...input, registrationId: "x".repeat(129) },
    { ...input, accessToken: "x".repeat(257) }, { ...input, accessToken: "\nsecret" },
    { ...input, registrationId: "a\u0000b" }, { ...input, accessToken: "a\u200bb" },
  ])("rejects invalid input %#", value => expect(studentClaimSchema.safeParse(value).success).toBe(false));
  it("preserves token case and supports historical formats with outer spaces", () => {
    expect(studentClaimSchema.parse({ registrationId: " OLD-1234 ", accessToken: " Mixed-Token " })).toEqual({ registrationId: "OLD-1234", accessToken: "Mixed-Token" });
  });
});

describe("transactional student claim", () => {
  it("links once in a closed period without changing status/hash or creating records", async () => {
    const mock = database();
    const result = await claimApplicationForUser(mock.db, input, actor);
    expect(result).toEqual({ success: true, isAlreadyLinked: false });
    expect(mock.db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted", maxWait: 3000, timeout: 5000 });
    expect(mock.application.updateMany).toHaveBeenCalledTimes(1);
    const args = mock.application.updateMany.mock.calls[0][0];
    expect(Object.keys(args.data).sort()).toEqual(["userId", "verifiedAt"]);
    expect(args.where).toMatchObject({ userId: null, verifiedAt: null, deletedAt: null, updatedAt: new Date("2026-01-01"), recruitmentPeriod: { deletedAt: null } });
    expect(mock.read()?.status).toBe("MENUNGGU_VERIFIKASI");
    expect(mock.read()?.accessTokenHash === hashAccessToken(token)).toBe(true);
  });
  it.each(["missing", "wrong-token", "bad-hash", "username", "other-owner", "ambiguous", "deleted", "period-deleted"])("rejects %s without a write", async kind => {
    const row = record();
    if (kind === "bad-hash") row.accessTokenHash = "malformed";
    if (kind === "username") row.robloxUsernameKey = "another";
    if (kind === "other-owner") row.userId = "owner-b";
    if (kind === "ambiguous") row.verifiedAt = new Date();
    if (kind === "deleted") row.deletedAt = new Date();
    if (kind === "period-deleted") row.recruitmentPeriod.deletedAt = new Date();
    const mock = database(kind === "missing" ? null : row);
    const before = structuredClone(mock.read());
    await expect(claimApplicationForUser(mock.db, { ...input, accessToken: kind === "wrong-token" ? "wrong" : token }, actor)).rejects.toBeInstanceOf(StudentClaimError);
    expect(mock.application.updateMany).not.toHaveBeenCalled();
    expect(mock.read()).toEqual(before);
  });
  it("uses a dummy comparison for a missing record", async () => {
    const compare = vi.spyOn(crypto, "timingSafeEqual");
    try {
      await expect(claimApplicationForUser(database(null).db, input, actor)).rejects.toBeInstanceOf(StudentClaimError);
      expect(compare).toHaveBeenCalledTimes(1);
    } finally { compare.mockRestore(); }
  });
  it("same owner is idempotent after a username change, but must still provide the token", async () => {
    const row = { ...record(), userId: actor.id, verifiedAt: new Date("2026-01-02") };
    const mock = database(row);
    expect(await claimApplicationForUser(mock.db, input, { ...actor, username: "Renamed" })).toEqual({ success: true, isAlreadyLinked: true });
    await expect(claimApplicationForUser(mock.db, { ...input, accessToken: "wrong" }, actor)).rejects.toBeInstanceOf(StudentClaimError);
    expect(mock.application.updateMany).not.toHaveBeenCalled();
    expect(mock.read()).toEqual(row);
  });
  it("rejects a soft-deleted actor before opening a transaction", async () => {
    const mock = database();
    await expect(claimApplicationForUser(mock.db, input, { ...actor, deletedAt: new Date() })).rejects.toBeInstanceOf(StudentClaimError);
    expect(mock.db.$transaction).not.toHaveBeenCalled();
  });
  it.each(["other", "same", "rotated", "deleted", "unchanged"])("rechecks a conditional-update conflict: %s", async winner => {
    const mock = database();
    mock.application.updateMany.mockImplementation(async () => {
      const row = record();
      if (winner !== "unchanged") row.userId = winner === "other" ? "owner-b" : actor.id;
      if (winner === "rotated") row.accessTokenHash = hashAccessToken("new-token");
      if (winner === "deleted") row.deletedAt = new Date();
      mock.set(row); return { count: 0 };
    });
    const promise = claimApplicationForUser(mock.db, input, actor);
    if (winner === "same") expect(await promise).toEqual({ success: true, isAlreadyLinked: true });
    else await expect(promise).rejects.toBeInstanceOf(StudentClaimError);
    expect(mock.application.updateMany).toHaveBeenCalledTimes(1);
  });
  it("rejects a version changed between credential verification and helper read", async () => {
    const mock = database();
    mock.application.findUnique.mockResolvedValueOnce(record()).mockResolvedValue({ ...record(), updatedAt: new Date("2026-02-01") });
    await expect(claimApplicationForUser(mock.db, input, actor)).rejects.toBeInstanceOf(StudentClaimError);
    expect(mock.application.updateMany).not.toHaveBeenCalled();
  });
  it.each([false, true])("simulates simultaneous requests, same owner=%s (not a PostgreSQL proof)", async sameOwner => {
    const mock = database();
    let arrivals = 0; let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    mock.application.findUnique.mockImplementation(async (args?: any) => {
      const snapshot = structuredClone(mock.read());
      if (args?.where.registrationId) { if (++arrivals === 2) release(); await barrier; }
      return snapshot;
    });
    const results = await Promise.allSettled([
      claimApplicationForUser(mock.db, input, actor),
      claimApplicationForUser(mock.db, input, { ...actor, id: sameOwner ? actor.id : "owner-b" }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(sameOwner ? 2 : 1);
    expect(mock.read()?.userId).toBe(actor.id);
    expect(mock.read()?.status).toBe("MENUNGGU_VERIFIKASI");
  });
  it("propagates database failure without logging credentials", async () => {
    const mock = database();
    const log = vi.spyOn(console, "error");
    mock.application.findUnique.mockRejectedValue(new Error("synthetic-db-error"));
    try {
      await expect(claimApplicationForUser(mock.db, input, actor)).rejects.toThrow("synthetic-db-error");
      expect(mock.application.updateMany).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
