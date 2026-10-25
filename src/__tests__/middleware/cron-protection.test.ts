import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// TASK 03L.2E.4.10B-SEC-R2 — Matriks V1–V12.
//
// 10B-SEC-R1 membuktikan ada blocker: middleware mewajibkan cookie
// `brk_admin_verified`, sehingga scheduler tanpa cookie ditolak di lapisan
// cookie dan gate route-level `isAdmin(req)` tidak pernah tereksekusi.
//
// R2 menambah `KEY_ONLY_PREFIXES` sehingga scheduler boleh melewati pemeriksa
// cookie — TAPI hanya SETELAH lolos `x-admin-key`, dan hanya untuk path yang
// disebut eksplisit.
//
// KETERBATASAN: unit test fungsi middleware dengan NextRequest buatan dan
// secret palsu. TIDAK membuktikan: header benar-benar sampai ke fungsi di
// produksi, apakah middleware ter-deploy, atau konfigurasi scheduler produksi.
// Ketiganya belum diverifikasi.
// ============================================================================

const TEST_ADMIN_KEY = "test-admin-key-not-a-real-secret";
const TEST_JWT_SECRET = "test-jwt-secret-not-a-real-secret";

vi.mock("@/lib/constants", () => ({
  getAdminKey: () => TEST_ADMIN_KEY,
  getJwtSecret: () => TEST_JWT_SECRET,
}));

const { middleware } = await import("@/middleware");

function req(pathname: string, headers: Record<string, string> = {}) {
  const url = new URL(`http://localhost${pathname}`);
  return {
    nextUrl: { pathname: url.pathname },
    headers: new Headers(headers),
    cookies: { get: () => undefined },
  } as never;
}

const keyHeader = (key = TEST_ADMIN_KEY) => ({ "x-admin-key": key });

/** Helper: NextResponse.next() tidak punya body JSON — status 200 + tanpa `ok:false`. */
async function body(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.clone().json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// V1, V2 — key tetap wajib untuk auto-submit
// ---------------------------------------------------------------------------

describe("V1–V2 — auto-submit tetap memerlukan x-admin-key", () => {
  it("V1. tanpa header key → 401 'Kunci admin salah.'", async () => {
    const res = await middleware(req("/api/cron/auto-submit"));

    expect(res.status).toBe(401);
    const json = await body(res);
    expect(json?.ok).toBe(false);
    expect(json?.message).toBe("Kunci admin salah.");
  });

  it("V2. key salah → 401", async () => {
    const res = await middleware(req("/api/cron/auto-submit", keyHeader("wrong-key")));

    expect(res.status).toBe(401);
    expect((await body(res))?.message).toBe("Kunci admin salah.");
  });
});

// ---------------------------------------------------------------------------
// V3, V4 — kunci dari R2: scheduler tanpa cookie boleh lewat
// ---------------------------------------------------------------------------

describe("V3–V4 — key valid tanpa cookie admin LOLOS middleware (hanya auto-submit)", () => {
  it("V3. key valid, TANPA cookie → NextResponse.next() (bukan 401)", async () => {
    const res = await middleware(req("/api/cron/auto-submit", keyHeader()));

    // NextResponse.next() = status 200, tanpa body JSON.
    expect(res.status).toBe(200);
    expect(await body(res)).toBeNull();
  });

  it("V4. jalur passthrough tidak terlindungi tetap tidak berubah (tanpa key tetap lolos)", async () => {
    // Perilaku lama dipertahankan: path tak terlindung tidak diapa-apakan.
    const res = await middleware(req("/api/cron/apa-saja-tua"));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// V5 — gate route-level (dibuktikan di route.test.ts; di sini dicek independence)
// ---------------------------------------------------------------------------

describe("V5 — gerbang route-level tetap wajib (kontrak tidak berubah)", () => {
  it("V5. middleware TIDAK Pocoleh melewati gate route: tanpa key tetap 401 meski ada cookie", async () => {
    // Bila KEY_ONLY sempat salah tempat (sebelum cek key), test ini gagal.
    const fake = {
      nextUrl: { pathname: "/api/cron/auto-submit" },
      headers: new Headers({ cookie: "brk_admin_verified=fake" }),
      cookies: { get: () => ({ value: "fake" }) },
    } as never;

    const res = await middleware(fake);

    expect(res.status).toBe(401);
    expect((await body(res))?.message).toBe("Kunci admin salah.");
  });
});

// ---------------------------------------------------------------------------
// V6, V7, V8 — guard anti-overshoot: route lain TIDAK boleh ikut key-only
// ---------------------------------------------------------------------------

describe("V6–V8 — route lain tetap memerlukan cookie", () => {
  it("V6. /api/cron/discord-retry + key valid tanpa cookie → 401 (TIDAK ikut key-only)", async () => {
    const res = await middleware(req("/api/cron/discord-retry", keyHeader()));

    expect(res.status).toBe(401);
    expect((await body(res))?.message).toBe("Verifikasi admin tahap kedua wajib dilakukan.");
  });

  it("V7. /api/admin/* + key valid tanpa cookie → 401", async () => {
    for (const p of ["/api/admin/users", "/api/admin/period", "/api/admin/candidates"]) {
      const res = await middleware(req(p, keyHeader()));
      expect(res.status).toBe(401);
    }
  });

  it("V8. /api/attendance/list + key valid tanpa cookie → 401", async () => {
    const res = await middleware(req("/api/attendance/list", keyHeader()));

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// V9, V10 — KEY_ONLY_PREFIXES bukan wildcard
// ---------------------------------------------------------------------------

describe("V9–V10 — tidak ada pelebaran ke seluruh /api/cron/*", () => {
  it("V9. path cron lain yang tidak terdaftar → tetap passthrough, tidak dapat key-only", async () => {
    // Kalau KEY_ONLY memakai wildcard "/api/cron/", path ini akan ikut.
    // Karena tidak terdaftar di PROTECTED_PREFIXES, ia passthrough — bukan 401.
    const res = await middleware(req("/api/cron/job-lain"));
    expect(res.status).toBe(200);
    expect(await body(res)).toBeNull();
  });

  it("V10. /api/cron/discord-retry (path cron yang terdaftar) TETAP butuh cookie", async () => {
    // Pembuktian utama bahwa tidak ada wildcard: satu-satunya route cron yang
    // nyata dan terdaftar, dan ia TIDAK dapat melewati cookie.
    const tanpaCookie = await middleware(req("/api/cron/discord-retry", keyHeader()));
    expect(tanpaCookie.status).toBe(401);

    // Dan auto-submit (yang memang didaftarkan) tetap dapat melewati.
    const autoSubmit = await middleware(req("/api/cron/auto-submit", keyHeader()));
    expect(autoSubmit.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// V11 — tidak ada secret di respons
// ---------------------------------------------------------------------------

describe("V11 — respons tidak membocorkan secret", () => {
  it("V11a. 401 key salah → body tidak mengandung key/JWT secret", async () => {
    const res = await middleware(req("/api/cron/auto-submit", keyHeader("wrong")));
    const raw = JSON.stringify(await body(res));

    expect(raw).not.toContain(TEST_ADMIN_KEY);
    expect(raw).not.toContain(TEST_JWT_SECRET);
  });

  it("V11b. 401 cookie hilang → body tidak mengandung key/JWT secret", async () => {
    const res = await middleware(req("/api/admin/users", keyHeader()));
    const raw = JSON.stringify(await body(res));

    expect(raw).not.toContain(TEST_ADMIN_KEY);
    expect(raw).not.toContain(TEST_JWT_SECRET);
  });

  it("V11c. tidak ada header yang di-echo di respons maupun console", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const spyErr = vi.spyOn(console, "error").mockImplementation(() => {});

    await middleware(req("/api/cron/auto-submit", keyHeader("wrong-key")));
    await middleware(req("/api/cron/auto-submit"));

    for (const call of [...spy.mock.calls, ...spyErr.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(TEST_ADMIN_KEY);
    }
    spy.mockRestore();
    spyErr.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// V12 — path yang tidak terlindungi / exempt tidak berubah
// ---------------------------------------------------------------------------

describe("V12 — perilaku lama tidak berubah untuk path lain", () => {
  it("V12a. EXEMPT_PATHS tetap tanpa proteksi", async () => {
    for (const p of ["/api/admin/auth/verify-staff", "/api/admin/auth/session", "/api/admin/init"]) {
      const res = await middleware(req(p));
      expect(res.status).toBe(200);
    }
  });

  it("V12b. prefix /api/admin/ tanpa key tetap 401", async () => {
    for (const p of ["/api/admin/users", "/api/attendance/list", "/api/cron/discord-retry"]) {
      const res = await middleware(req(p));
      expect(res.status).toBe(401);
    }
  });

  it("V12c. sub-path di bawah batas segmen tetap key-only DAN tetap butuh key", async () => {
    const denganKey = await middleware(req("/api/cron/auto-submit/anything/deeper", keyHeader()));
    expect(denganKey.status).toBe(200);

    const tanpaKey = await middleware(req("/api/cron/auto-submit/anything/deeper"));
    expect(tanpaKey.status).toBe(401);
  });
});

// ============================================================================
// TASK 03L.2E.4.10B-SEC-R3 — Batas segmen untuk KEY_ONLY_PREFIXES.
//
// R2-RV membuktikan `isKeyOnly` memakai `startsWith(prefix)` polos, sehingga
// path saudara seperti `/api/cron/auto-submit-admin` ikut melewati cookie.
// R3 memperketat: hanya pathname PERSIS dan sub-path yang diawali `prefix + "/"`
// yang boleh melewati cookie/JWT.
//
// KETERBATASAN: unit test fungsi middleware dengan NextRequest buatan. TIDAK
// membuktikan bagaimana runtime Next.js menormalkan trailing slash — hanya
// membuktikan perilaku fungsi murni untuk pathname apa adanya.
// ============================================================================

describe("R3-S1 — path persis tetap diizinkan", () => {
  it("R3-S1. /api/cron/auto-submit + key valid tanpa cookie → 200 (tetap diizinkan)", async () => {
    const res = await middleware(req("/api/cron/auto-submit", keyHeader()));

    expect(res.status).toBe(200);
    expect(await body(res)).toBeNull();
  });

  it("R3-S1b. /api/cron/auto-submit tanpa key → 401 (key tetap wajib)", async () => {
    const res = await middleware(req("/api/cron/auto-submit"));

    expect(res.status).toBe(401);
    expect((await body(res))?.message).toBe("Kunci admin salah.");
  });
});

describe("R3-S2 — sub-path di bawah batas segmen diizinkan", () => {
  it("R3-S2. /api/cron/auto-submit/x + key valid tanpa cookie → 200", async () => {
    const res = await middleware(req("/api/cron/auto-submit/x", keyHeader()));

    expect(res.status).toBe(200);
    expect(await body(res)).toBeNull();
  });

  it("R3-S2b. sub-path dalam + key, tanpa key → 401", async () => {
    const res = await middleware(req("/api/cron/auto-submit/x"));

    expect(res.status).toBe(401);
  });
});

describe("R3-S3 — kebijakan trailing slash", () => {
  // POLICY: '/api/cron/auto-submit/' diawali '/api/cron/auto-submit/' sehingga
  // regarded sebagai sub-path sah. Ini perilaku fungsi murni — TIDAK merupakan
  // klaim tentang bagaimana runtime Next.js menormalkan trailing slash.
  it("R3-S3. /api/cron/auto-submit/ (trailing slash) + key valid tanpa cookie → 200", async () => {
    const res = await middleware(req("/api/cron/auto-submit/", keyHeader()));

    expect(res.status).toBe(200);
    expect(await body(res)).toBeNull();
  });

  it("R3-S3b. trailing slash tanpa key → 401", async () => {
    const res = await middleware(req("/api/cron/auto-submit/"));

    expect(res.status).toBe(401);
  });
});

describe("R3-S4 — sibling collision HARUS gagal (inti dari R3)", () => {
  const SIBLINGS = [
    "/api/cron/auto-submit-admin",
    "/api/cron/auto-submitX",
    "/api/cron/auto-submitted",
    "/api/cron/auto-submit_v2",
    "/api/cron/auto-submit.backfill",
    "/api/cron/auto-submitbackfill",
  ];

  it("R3-S4. sibling + key valid tanpa cookie → 401 (WAJIB melewati cookie/JWT)", async () => {
    for (const p of SIBLINGS) {
      const res = await middleware(req(p, keyHeader()));

      // 401 = masih di protected path (prefix PROTECTED_PREFIXES cocok),
      // lalu tertahan lapisan cookie karena TIDAK key-only.
      expect(res.status, `tidak.key.only.harus.tidak.untuk: ${p}`).toBe(401);
      expect((await body(res))?.message).toBe("Verifikasi admin tahap kedua wajib dilakukan.");
    }
  });

  it("R3-S4b. sibling tanpa key → 401 (key tetap wajib, tidak ada jalur bebas)", async () => {
    for (const p of SIBLINGS) {
      const res = await middleware(req(p));

      expect(res.status, `tanpa.key.harus.401: ${p}`).toBe(401);
      expect((await body(res))?.message).toBe("Kunci admin salah.");
    }
  });

  it("R3-S4c. sibling dengan key SALAH → 401", async () => {
    for (const p of SIBLINGS) {
      const res = await middleware(req(p, keyHeader("wrong")));

      expect(res.status).toBe(401);
      expect((await body(res))?.message).toBe("Kunci admin salah.");
    }
  });
});

describe("R3-S5 — route lain tetap perlu cookie/JWT", () => {
  it("R3-S5a. discord-retry + key valid tanpa cookie → 401", async () => {
    const res = await middleware(req("/api/cron/discord-retry", keyHeader()));

    expect(res.status).toBe(401);
    expect((await body(res))?.message).toBe("Verifikasi admin tahap kedua wajib dilakukan.");
  });

  it("R3-S5b. /api/admin/* + key valid tanpa cookie → 401", async () => {
    for (const p of ["/api/admin/users", "/api/admin/period", "/api/admin/candidates"]) {
      const res = await middleware(req(p, keyHeader()));
      expect(res.status).toBe(401);
    }
  });

  it("R3-S5c. /api/attendance/list + key valid tanpa cookie → 401", async () => {
    const res = await middleware(req("/api/attendance/list", keyHeader()));

    expect(res.status).toBe(401);
  });
});

describe("R3-S6 — middleware tidak melewati key sama sekali", () => {
  it("R3-S6. tanpa key, semua varian path ditolak 401 di lapisan key", async () => {
    for (const p of [
      "/api/cron/auto-submit",
      "/api/cron/auto-submit/",
      "/api/cron/auto-submit/x",
      "/api/cron/auto-submit-admin",
    ]) {
      const res = await middleware(req(p));
      expect(res.status, `tanpa.key: ${p}`).toBe(401);
      expect((await body(res))?.message).toBe("Kunci admin salah.");
    }
  });

  it("R3-S6b. key valid + cookie PALSU tidak pernah menggantikan key yang hilang", async () => {
    const fake = {
      nextUrl: { pathname: "/api/cron/auto-submit/x" },
      headers: new Headers({ cookie: "brk_admin_verified=fake" }),
      cookies: { get: () => ({ value: "fake" }) },
    } as never;

    const res = await middleware(fake);

    expect(res.status).toBe(401);
    expect((await body(res))?.message).toBe("Kunci admin salah.");
  });
});

describe("R3-S7 — gate route-level tetap ada", () => {
  it("R3-S7. route-level isAdmin(req) menolak tanpa key sebelum akses DB", async () => {
    // Dijuga ketat di src/app/api/cron/auto-submit/__tests__/route.test.ts.
    // Tes ini hanya mengunci bahwa TIDAK ADA regresi pada gate route.
    const { GET } = await import("@/app/api/cron/auto-submit/route");
    const res = await GET(
      new Request("http://localhost/api/cron/auto-submit", { headers: {} }),
    );

    expect(res.status).toBe(401);
  });
});