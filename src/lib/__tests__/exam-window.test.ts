import { describe, it, expect } from "vitest";
import { decideExamSessionAction, isAttemptSubmittable } from "@/lib/exam-window";

const start = new Date("2026-10-01T08:00:00.000Z");
const end = new Date("2026-10-01T15:55:00.000Z");

describe("decideExamSessionAction", () => {
  it("memblokir attempt baru setelah examEndTime", () => {
    const result = decideExamSessionAction({
      now: new Date("2026-10-01T16:00:00.000Z"),
      isExamOpen: true,
      examStartTime: start,
      examEndTime: end,
      hasUnsubmittedAttempt: false,
    });
    expect(result.action).toBe("block");
  });

  it("tetap resume attempt yang sudah mulai meski examEndTime lewat", () => {
    const result = decideExamSessionAction({
      now: new Date("2026-10-01T16:00:00.000Z"),
      isExamOpen: true,
      examStartTime: start,
      examEndTime: end,
      hasUnsubmittedAttempt: true,
    });
    expect(result).toEqual({ action: "resume" });
  });

  it("membuat attempt baru saat jendela masih terbuka", () => {
    const result = decideExamSessionAction({
      now: new Date("2026-10-01T10:00:00.000Z"),
      isExamOpen: true,
      examStartTime: start,
      examEndTime: end,
      hasUnsubmittedAttempt: false,
    });
    expect(result).toEqual({ action: "create" });
  });

  it("memblokir semua jika admin menutup isExamOpen", () => {
    const result = decideExamSessionAction({
      now: new Date("2026-10-01T10:00:00.000Z"),
      isExamOpen: false,
      examStartTime: start,
      examEndTime: end,
      hasUnsubmittedAttempt: true,
    });
    expect(result.action).toBe("block");
  });
});

describe("isAttemptSubmittable", () => {
  it("masih boleh submit dalam durasi + grace 5 menit", () => {
    const startedAt = new Date("2026-10-01T10:00:00.000Z");
    const now = startedAt.getTime() + 49 * 60_000;
    expect(isAttemptSubmittable(now, startedAt, 45, 5)).toBe(true);
  });

  it("menolak submit setelah durasi + grace habis", () => {
    const startedAt = new Date("2026-10-01T10:00:00.000Z");
    const now = startedAt.getTime() + 51 * 60_000;
    expect(isAttemptSubmittable(now, startedAt, 45, 5)).toBe(false);
  });
});
