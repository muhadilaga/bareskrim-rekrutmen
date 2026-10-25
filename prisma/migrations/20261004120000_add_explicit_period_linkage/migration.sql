-- AlterTable
ALTER TABLE "ExamPeriod" ADD COLUMN "recruitmentPeriodId" TEXT;

-- CreateIndex
CREATE INDEX "ExamPeriod_recruitmentPeriodId_idx" ON "ExamPeriod"("recruitmentPeriodId");

-- AddForeignKey
ALTER TABLE "ExamPeriod" ADD CONSTRAINT "ExamPeriod_recruitmentPeriodId_fkey" FOREIGN KEY ("recruitmentPeriodId") REFERENCES "RecruitmentPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
