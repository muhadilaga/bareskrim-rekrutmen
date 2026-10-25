import { NextResponse } from "next/server";
import { CandidateGuardError } from "@/lib/candidate-guard";

/**
 * TASK 03L.2E.4.2 — Candidate Guard route integration helper.
 *
 * Mengubah CandidateGuardError menjadi respons HTTP fail-closed.
 * Eligibility/authorization failure → 4xx (lihat HTTP_STATUS_BY_CODE).
 * DB/system failure (GUARD_UNAVAILABLE) → 503.
 *
 * Mengembalikan null bila error BUKAN CandidateGuardError sehingga pemanggil
 * dapat melempar ulang error tak terduga (jangan menyamarkan bug sebagai 403).
 */
export function candidateGuardErrorResponse(err: unknown): NextResponse | null {
  if (!(err instanceof CandidateGuardError)) return null;
  return NextResponse.json(
    { ok: false, code: err.code, message: err.message },
    { status: err.httpStatus },
  );
}
