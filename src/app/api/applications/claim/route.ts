import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createUserRateLimiter } from "@/lib/rate-limit";
import { StudentClaimError } from "@/lib/application-service";
import { claimApplicationForUser, studentClaimSchema } from "@/lib/student-claim-service";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 2048;
// Development mitigation only: resets on restart, not shared across instances.
// No IP limiter: forwarded headers are not a trusted source of client identity here.
const claimLimiter = createUserRateLimiter({ max: 5, windowMs: 15 * 60_000 });

function reply(status: number, code: string, message: string, retryAfter?: number) {
  return NextResponse.json({ ok: status === 200, code, message }, {
    status,
    headers: { "Cache-Control": "private, no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) },
  });
}

function canonicalOrigin(): string | null {
  // This public URL is already configured for OAuth. Do not infer origin from
  // Host/X-Forwarded-*; the same public origin works behind a trusted TLS proxy.
  try {
    const url = new URL(process.env.ROBLOX_OAUTH_REDIRECT_URI?.trim() ?? "");
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}

class BodyTooLarge extends Error {}
async function readBoundedJson(req: Request): Promise<unknown> {
  const length = req.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new BodyTooLarge();
  if (!req.body) throw new SyntaxError();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new BodyTooLarge();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function POST(req: Request) {
  try {
    const expected = canonicalOrigin();
    if (!expected) return reply(503, "CLAIM_UNAVAILABLE", "Layanan penghubung pendaftaran belum tersedia.");
    const site = req.headers.get("sec-fetch-site");
    if (req.headers.get("origin") !== expected || (site !== null && site !== "same-origin")) {
      return reply(403, "REQUEST_REJECTED", "Permintaan tidak dapat diproses.");
    }
    if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return reply(415, "INVALID_REQUEST", "Format permintaan tidak didukung.");
    }
    const user = await getSessionUser(req);
    if (!user || user.deletedAt) return reply(401, "AUTH_REQUIRED", "Silakan masuk melalui Roblox terlebih dahulu.");
    const limit = claimLimiter.check(user.id);
    if (!limit.ok) return reply(429, "RATE_LIMITED", "Terlalu banyak percobaan. Silakan tunggu sebelum mencoba lagi.", limit.retryAfterSeconds);
    let body: unknown;
    try { body = await readBoundedJson(req); }
    catch (error) {
      return error instanceof BodyTooLarge
        ? reply(413, "INVALID_REQUEST", "Data permintaan terlalu besar.")
        : reply(400, "INVALID_REQUEST", "Periksa format data yang Anda masukkan.");
    }
    const parsed = studentClaimSchema.safeParse(body);
    if (!parsed.success) return reply(400, "INVALID_REQUEST", "Periksa format data yang Anda masukkan.");
    await claimApplicationForUser(prisma, parsed.data, { id: user.id, username: user.username, deletedAt: user.deletedAt });
    return reply(200, "CLAIM_OK", "Pendaftaran berhasil dihubungkan.");
  } catch (error) {
    if (error instanceof StudentClaimError) {
      return reply(400, "CLAIM_REJECTED", "Pendaftaran belum dapat dihubungkan. Periksa Registration ID, Access Token, dan akun Roblox yang digunakan.");
    }
    // Never log raw errors, request input, hashes, or user identity.
    return reply(503, "CLAIM_UNAVAILABLE", "Hasil belum dapat dipastikan. Muat ulang dashboard sebelum mencoba lagi.");
  }
}
