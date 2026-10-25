import type { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { linkApplicationToUser, StudentClaimError, verifyAccessTokenCredential } from "./application-service";

const inputString = (max: number) => z.string().max(max).refine(
  value => !/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\ufeff]/.test(value),
).transform(value => value.trim()).pipe(z.string().min(1).max(max));

export const studentClaimSchema = z.object({
  registrationId: inputString(128),
  accessToken: inputString(256),
}).strict();

export type StudentClaimInput = z.infer<typeof studentClaimSchema>;
type ClaimActor = { id: string; username: string; deletedAt: Date | null };

const claimSelect = {
  id: true, accessTokenHash: true, userId: true, verifiedAt: true,
  deletedAt: true, updatedAt: true, robloxUsernameKey: true,
  recruitmentPeriod: { select: { deletedAt: true } },
} satisfies Prisma.ApplicationSelect;
type ClaimRecord = Prisma.ApplicationGetPayload<{ select: typeof claimSelect }>;

function verify(record: ClaimRecord | null, token: string): asserts record is ClaimRecord {
  // A missing record or malformed hash still performs a fixed-size dummy comparison.
  const valid = verifyAccessTokenCredential(token, record?.accessTokenHash ?? "");
  if (!record || !valid) throw new StudentClaimError("INVALID_CREDENTIALS", "Claim ditolak.");
  if (record.deletedAt || record.recruitmentPeriod.deletedAt || (!record.userId && record.verifiedAt)) {
    throw new StudentClaimError("APPLICATION_INELIGIBLE", "Claim ditolak.");
  }
}

/** Only call with a user returned by getSessionUser(). No identity is taken from input. */
export async function claimApplicationForUser(
  db: Pick<PrismaClient, "$transaction">,
  input: StudentClaimInput,
  actor: ClaimActor,
) {
  if (actor.deletedAt) throw new StudentClaimError("APPLICATION_INELIGIBLE", "Claim ditolak.");
  return db.$transaction(async tx => {
    const record = await tx.application.findUnique({ where: { registrationId: input.registrationId }, select: claimSelect });
    verify(record, input.accessToken);
    try {
      return await linkApplicationToUser(tx, {
        applicationId: record.id, userId: actor.id, robloxUsername: actor.username,
        expectedUpdatedAt: record.updatedAt,
      });
    } catch (error) {
      if (!(error instanceof StudentClaimError) || error.code !== "APPLICATION_CHANGED") throw error;
      const current = await tx.application.findUnique({ where: { id: record.id }, select: claimSelect });
      verify(current, input.accessToken);
      if (current.userId === actor.id) return { success: true, isAlreadyLinked: true };
      throw new StudentClaimError("APPLICATION_CHANGED", "Claim ditolak.");
    }
  }, { isolationLevel: "ReadCommitted", maxWait: 3000, timeout: 5000 });
}
