import { describe, it, expect, vi } from "vitest";
import { POST } from "../route";

describe("POST /api/attendance/verify — Legacy Tombstone", () => {
  it("returns HTTP 410 Gone with LEGACY_ATTENDANCE_DISABLED code", async () => {
    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(410);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(data).toEqual({
      ok: false,
      code: "LEGACY_ATTENDANCE_DISABLED",
      message: "Fitur verifikasi absensi legacy telah dinonaktifkan. Silakan gunakan portal absensi resmi.",
    });
  });

  it("does not trigger any side effects or accept legacy requests", async () => {
    // Calling POST multiple times consistently returns 410
    const res1 = await POST();
    const res2 = await POST();

    expect(res1.status).toBe(410);
    expect(res2.status).toBe(410);
  });
});
