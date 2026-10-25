/**
 * TASK 03L.2E.4.10B — Hard guard target untuk integration test terisolasi.
 *
 * MODUL INI MURNI: tidak meng-import @prisma/client, tidak membuka koneksi,
 * tidak membaca file, tidak menyentuh environment. Semua fungsi menerima
 * input sebagai string/objek sehingga bisa diuji tanpa database.
 *
 * TUJUAN: memastikan harness HANYA-AKANYA bisa sampai ke instance
 * PostgreSQL terisolasi t047_concurrency, dan tidak pernah ke 5432,
 * Supabase, pooler, atau development/production.
 *
 * KEAMANAN: fungsi di sini tidak pernah mengembalikan atau mencetak password
 * maupun connection string lengkap. Kegagalan dilaporkan sebagai NAMA FIELD
 * saja, tanpa nilai — sehingga pesan error pun tidak bisa bocor.
 */

/** Target yang diizinkan. Tidak boleh longgar. */
export const EXPECTED_TARGET = {
  host: "127.0.0.1",
  port: 55433,
  database: "t047_concurrency",
  user: "t047_runner",
} as const;

/** Port yang secara eksplisit dilarang. */
export const FORBIDDEN_PORTS: readonly number[] = [5432];

/** Bentuk target yang longgar (dipakai test untuk sengaja memasukkan nilai salah). */
export type TargetSpec = {
  host: string;
  port: number;
  database: string;
  user: string;
};

export type GuardResult =
  | { ok: true }
  | { ok: false; failedFields: string[] };

const OK: GuardResult = { ok: true };

/**
 * Validasi URL target. Mengembalikan daftar field yang GAGAL — nilai
 * field TIDAK pernah dikembalikan ke pemanggil.
 */
export function validateTargetUrl(rawUrl: string | undefined | null): GuardResult {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    return { ok: false, failedFields: ["url_missing"] };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, failedFields: ["url_unparsable"] };
  }

  const failed: string[] = [];

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    failed.push("protocol");
  }
  if (parsed.hostname !== EXPECTED_TARGET.host) {
    failed.push("host");
  }

  const port = parsed.port === "" ? 5432 : Number(parsed.port);
  if (FORBIDDEN_PORTS.includes(port)) {
    failed.push("port_forbidden");
  } else if (port !== EXPECTED_TARGET.port) {
    failed.push("port");
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (database !== EXPECTED_TARGET.database) {
    failed.push("database");
  }

  let user = "";
  try {
    user = decodeURIComponent(parsed.username);
  } catch {
    user = parsed.username;
  }
  if (user !== EXPECTED_TARGET.user) {
    failed.push("user");
  }

  if (parsed.password === "") {
    failed.push("password_missing");
  }

  return failed.length === 0 ? OK : { ok: false, failedFields: failed };
}

/**
 * Bentuk representation yang AMAN untuk dicatat: tanpa password.
 * Hanya untuk pesan diagnostik — bukan untuk koneksi.
 */
export function redactUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const user = parsed.username ? `${decodeURIComponent(parsed.username)}:***@` : "";
    return `${parsed.protocol}//${user}${parsed.host}${parsed.pathname}`;
  } catch {
    return "<unparsable-url>";
  }
}

/** Rakit URL dari komponen terpisah (dipakai harness setelah dapat kredensial). */
export function buildRunnerUrl(input: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}): string {
  return `postgresql://${encodeURIComponent(input.user)}:${encodeURIComponent(
    input.password
  )}@${input.host}:${input.port}/${input.database}`;
}

/**
 * Ambil kredensial role runner dari isi pgpass (baris `host:port:db:user:pass`).
 *
 * Fungsi PURE: menerima TEKS, bukan path. Pemanggil yang membaca file.
 * Sengaja tidak menerima path supaya unit test bisa memakai data sintetis
 * tanpa menyentuh secret asli.
 */
export function extractRunnerCredential(
  pgpassText: string,
  expected: TargetSpec
): { user: string; password: string } | null {
  const lines = pgpassText.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const parts = line.split(":");
    if (parts.length < 5) continue;
    const [host, port, database, user, ...rest] = parts;
    if (
      host === expected.host &&
      Number(port) === expected.port &&
      database === expected.database &&
      user === expected.user
    ) {
      return { user, password: rest.join(":") };
    }
  }
  return null;
}

/** Pesan diagnostik yang aman: hanya nama field, tanpa nilai. */
export function describeGuardFailure(result: GuardResult): string {
  if (result.ok) return "target guard: OK";
  return `target guard GAGAL pada field: ${result.failedFields.join(", ")}`;
}