import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  assertPrimitiveValues,
  countBoundValues,
  deriveParamMap,
  rebindSql,
} from "../support/params";

// Catatan: pengujian identitas peran sesi pindah ke `session-role-identity.test.ts`.

// ============================================================================
// TASK 03L.2E.4.10B — Unit test sintetis untuk capture/rebind + identity guard.
//
// TIDAK ADA KONEKSI DATABASE DI SINI. Semua `Prisma.Sql` dibangun di memori
// dan diperiksa lewat `.inspect()` — tidak pernah dikirim ke server.
// ============================================================================

/**
 * Bentuk statement yang MENIRU struktur asli (1 fragmen SET), dibangun dengan
 * Prisma.sql sehingga benar-benar terparameterisasi.
 */
function sqlWithFragments(includeFlag: boolean, includeBookmark: boolean): Prisma.Sql {
  const set: Prisma.Sql[] = [
    Prisma.sql`"savedAnswers" = ${JSON.stringify({ q1: "A" })}::jsonb`,
  ];
  if (includeFlag) set.push(Prisma.sql`"flaggedQuestions" = ${JSON.stringify(["q1"])}::jsonb`);
  if (includeBookmark)
    set.push(Prisma.sql`"bookmarkedQuestions" = ${JSON.stringify(["q2"])}::jsonb`);

  return Prisma.sql`
      WITH elig AS MATERIALIZED (
        SELECT a.id
          FROM "Application" a
          JOIN "RecruitmentPeriod" rp ON rp.id = a."recruitmentPeriodId"
         WHERE a.id                       = ${"APP_ID"}
           AND a."userId"                = ${"ELIG_USER_ID"}
           AND a.status                  = 'DITERIMA'
           AND a."deletedAt"             IS NULL
           AND a."recruitmentPeriodId"   = ${"RP_ID"}
           AND rp."deletedAt"            IS NULL
           FOR UPDATE OF a
      )
      UPDATE "ExamAttempt" att
         SET ${Prisma.join(set, ", ")}
       WHERE att.id           = ${"ATT_ID"}
         AND att."userId"     = ${"ATT_USER_ID"}
         AND att."periodId"   = ${"EP_ID"}
         AND att."submittedAt" IS NULL
         AND att."deletedAt"   IS NULL
         AND EXISTS (SELECT 1 FROM elig)
      RETURNING att.id
    `;
}

describe("deriveParamMap mengenali setiap parameter", () => {
  it("1. variasi 1 fragmen memetakan 7 parameter dengan benar", () => {
    const { statement, values } = sqlWithFragments(false, false).inspect();
    const map = deriveParamMap(statement);

    expect(values).toHaveLength(7);
    expect(map).toEqual({
      applicationId: 0,
      eligibilityUserId: 1,
      recruitmentPeriodId: 2,
      savedAnswers: 3,
      attemptId: 4,
      attemptUserId: 5,
      attemptPeriodId: 6,
    });
  });

  it("2. variasi 2 fragmen menggeser indeks attempt* DAN menambah flagged", () => {
    const { statement, values } = sqlWithFragments(true, false).inspect();
    const map = deriveParamMap(statement);

    expect(values).toHaveLength(8);
    expect(map.savedAnswers).toBe(3);
    expect(map.flaggedQuestions).toBe(4);
    expect(map.attemptId).toBe(5);
    expect(map.attemptUserId).toBe(6);
    expect(map.attemptPeriodId).toBe(7);
    // Tidak boleh ada indeks yang bentrok.
    expect(new Set(Object.values(map)).size).toBe(Object.values(map).length);
  });

  it("3. variasi 3 fragmen menggeser lagi (indeks TIDAK konstan)", () => {
    const one = deriveParamMap(sqlWithFragments(false, false).inspect().statement);
    const three = deriveParamMap(sqlWithFragments(true, true).inspect().statement);

    expect(three.savedAnswers).toBe(3);
    expect(three.flaggedQuestions).toBe(4);
    expect(three.bookmarkedQuestions).toBe(5);
    expect(three.attemptId).toBe(6);

    // INI inti masalahnya: attemptId berpindah. Vidaa index konstan akan salah.
    expect(three.attemptId).not.toBe(one.attemptId);
  });

  it("4. attemptUserId TIDAK tertukar dengan eligibilityUserId", () => {
    const map = deriveParamMap(sqlWithFragments(false, false).inspect().statement);
    expect(map.eligibilityUserId).toBe(1);
    expect(map.attemptUserId).toBe(5);
    expect(map.eligibilityUserId).not.toBe(map.attemptUserId);
  });

  it("5. nilai parameter tetap primitif (tidak ada Sql tersisip)", () => {
    expect(() => assertPrimitiveValues(sqlWithFragments(false, false))).not.toThrow();
    expect(() => assertPrimitiveValues(sqlWithFragments(true, false))).not.toThrow();
    expect(() => assertPrimitiveValues(sqlWithFragments(true, true))).not.toThrow();
  });

  it("6. countBoundValues sesuai variasi", () => {
    expect(countBoundValues(sqlWithFragments(false, false))).toBe(7);
    expect(countBoundValues(sqlWithFragments(true, true))).toBe(9);
  });
});

describe("rebindSql mengganti nilai tanpa mengubah struktur SQL", () => {
  it("7. hanya nilai target yang berubah; statement identik", () => {
    const original = sqlWithFragments(true, false);
    const before = original.inspect().statement;

    const rebound = rebindSql(original, { attemptId: "ATT_BARU", attemptPeriodId: "EP_BARU" });
    const after = rebound.inspect();

    expect(after.statement).toBe(before);
    expect(after.values).toContain("ATT_BARU");
    expect(after.values).toContain("EP_BARU");
    expect(after.values).not.toContain("ATT_ID");
    expect(after.values).not.toContain("EP_ID");
  });

  it("8. parameter lain tetap utuh", () => {
    const before = sqlWithFragments(false, false).inspect().values;
    const after = rebindSql(sqlWithFragments(false, false), {
      attemptId: "X",
    }).inspect().values;

    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
    expect(after[4]).toBe("X");
  });

  it("9. kunci tidak dikenal MENOLAK (bukan diam-diam diabaikan)", () => {
    expect(() => rebindSql(sqlWithFragments(false, false), { tidakAda: "x" })).toThrow(
      /tidak dikenal/
    );
  });

  it("10. rebind pada variasi 3 fragmen tetap presisi", () => {
    const sql = sqlWithFragments(true, true);
    const out = rebindSql(sql, {
      savedAnswers: JSON.stringify({ z: "1" }),
      bookmarkedQuestions: JSON.stringify(["zz"]),
    }).inspect();

    expect(out.values[3]).toBe(JSON.stringify({ z: "1" }));
    expect(out.values[5]).toBe(JSON.stringify(["zz"]));
    expect(out.values[6]).toBe("ATT_ID"); // attemptId tidak bergeser oleh override di atas
  });

  it("11. parameter yang berupa JSON string tetap terparameterisasi (tidak dirangkai)", () => {
    const hostile = JSON.stringify({ q1: "'; DROP TABLE \"User\"; --" });
    const { statement, values } = rebindSql(sqlWithFragments(false, false), {
      savedAnswers: hostile,
    }).inspect();

    expect(statement).not.toContain("DROP TABLE");
    expect(values).toContain(hostile);
  });
});

