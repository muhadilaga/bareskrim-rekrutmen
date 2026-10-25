-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'ESSAY');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('LULUS', 'TIDAK_LULUS');

-- CreateEnum
CREATE TYPE "BlacklistCategory" AS ENUM ('POLRI', 'PENDIDIKAN');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('MENUNGGU_VERIFIKASI', 'DITERIMA', 'DITOLAK');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('L', 'P');

-- CreateEnum
CREATE TYPE "VerdictStatus" AS ENUM ('LULUS', 'TIDAK_LULUS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "robloxId" BIGINT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "discordUsername" TEXT,
    "avatarUrl" TEXT,
    "profileUrl" TEXT,
    "requiredGroupId" BIGINT,
    "policeGroupRankId" BIGINT,
    "policeGroupRank" TEXT,
    "policeGroupRankNumber" INTEGER,
    "bannedGroupIds" JSONB,
    "matraBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamPeriod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isAttendanceOpen" BOOLEAN NOT NULL DEFAULT false,
    "isExamOpen" BOOLEAN NOT NULL DEFAULT false,
    "examStartTime" TIMESTAMP(3),
    "examEndTime" TIMESTAMP(3),
    "seed" INTEGER NOT NULL,
    "mcqCount" INTEGER,
    "essayCount" INTEGER,
    "passThreshold" INTEGER NOT NULL DEFAULT 70,
    "openedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExamPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB,
    "correctKey" TEXT,
    "points" INTEGER NOT NULL,
    "keywords" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamAttempt" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attemptKey" TEXT NOT NULL,
    "questionsJson" JSONB NOT NULL,
    "savedAnswers" JSONB,
    "flaggedQuestions" JSONB,
    "bookmarkedQuestions" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "isCorrect" BOOLEAN,
    "earnedPoints" INTEGER,

    CONSTRAINT "ExamAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamResult" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "mcqScore" INTEGER NOT NULL,
    "essayScore" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "answersJson" JSONB NOT NULL,
    "discordMessageId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExamResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlacklistEntry" (
    "id" TEXT NOT NULL,
    "category" "BlacklistCategory" NOT NULL,
    "username" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlacklistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerdictEntry" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "status" "VerdictStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VerdictEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "periodId" TEXT NOT NULL,
    "tahap" TEXT NOT NULL DEFAULT 'AKADEMIK',
    "status" TEXT NOT NULL DEFAULT 'HADIR',
    "discordUserId" TEXT,
    "motivation" TEXT,
    "motivationStatus" TEXT,
    "motivationReason" TEXT,
    "motivationAttemptCount" INTEGER NOT NULL DEFAULT 1,
    "roleEligible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentActionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "periodId" TEXT,
    "attemptId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingDiscordReport" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PendingDiscordReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentPeriod" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "recruitmentPeriodId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "robloxUsername" TEXT NOT NULL,
    "robloxUsernameKey" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "origin" TEXT NOT NULL,
    "experience" TEXT NOT NULL,
    "motivation" TEXT NOT NULL,
    "agreementAcceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'MENUNGGU_VERIFIKASI',
    "rejectionReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuntimeSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_robloxId_key" ON "User"("robloxId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamPeriod_seed_key" ON "ExamPeriod"("seed");

-- CreateIndex
CREATE INDEX "ExamPeriod_isActive_idx" ON "ExamPeriod"("isActive");

-- CreateIndex
CREATE INDEX "ExamPeriod_deletedAt_idx" ON "ExamPeriod"("deletedAt");

-- CreateIndex
CREATE INDEX "Question_type_isActive_idx" ON "Question"("type", "isActive");

-- CreateIndex
CREATE INDEX "Question_deletedAt_idx" ON "Question"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamAttempt_attemptKey_key" ON "ExamAttempt"("attemptKey");

-- CreateIndex
CREATE INDEX "ExamAttempt_userId_idx" ON "ExamAttempt"("userId");

-- CreateIndex
CREATE INDEX "ExamAttempt_periodId_idx" ON "ExamAttempt"("periodId");

-- CreateIndex
CREATE INDEX "ExamAttempt_submittedAt_idx" ON "ExamAttempt"("submittedAt");

-- CreateIndex
CREATE INDEX "ExamAttempt_deletedAt_idx" ON "ExamAttempt"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamAttempt_periodId_userId_key" ON "ExamAttempt"("periodId", "userId");

-- CreateIndex
CREATE INDEX "ExamAnswer_attemptId_idx" ON "ExamAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "ExamAnswer_questionId_idx" ON "ExamAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamAnswer_attemptId_questionId_key" ON "ExamAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamResult_attemptId_key" ON "ExamResult"("attemptId");

-- CreateIndex
CREATE INDEX "ExamResult_submittedAt_idx" ON "ExamResult"("submittedAt");

-- CreateIndex
CREATE INDEX "ExamResult_deletedAt_idx" ON "ExamResult"("deletedAt");

-- CreateIndex
CREATE INDEX "BlacklistEntry_category_idx" ON "BlacklistEntry"("category");

-- CreateIndex
CREATE INDEX "BlacklistEntry_username_idx" ON "BlacklistEntry"("username");

-- CreateIndex
CREATE INDEX "BlacklistEntry_createdAt_idx" ON "BlacklistEntry"("createdAt");

-- CreateIndex
CREATE INDEX "VerdictEntry_username_idx" ON "VerdictEntry"("username");

-- CreateIndex
CREATE INDEX "VerdictEntry_deletedAt_idx" ON "VerdictEntry"("deletedAt");

-- CreateIndex
CREATE INDEX "Attendance_periodId_idx" ON "Attendance"("periodId");

-- CreateIndex
CREATE INDEX "Attendance_discordUserId_idx" ON "Attendance"("discordUserId");

-- CreateIndex
CREATE INDEX "Attendance_deletedAt_idx" ON "Attendance"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_userId_periodId_tahap_key" ON "Attendance"("userId", "periodId", "tahap");

-- CreateIndex
CREATE INDEX "AdminLog_createdAt_idx" ON "AdminLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminLog_action_idx" ON "AdminLog"("action");

-- CreateIndex
CREATE INDEX "AdminLog_target_idx" ON "AdminLog"("target");

-- CreateIndex
CREATE INDEX "StudentActionLog_userId_idx" ON "StudentActionLog"("userId");

-- CreateIndex
CREATE INDEX "StudentActionLog_createdAt_idx" ON "StudentActionLog"("createdAt");

-- CreateIndex
CREATE INDEX "StudentActionLog_action_idx" ON "StudentActionLog"("action");

-- CreateIndex
CREATE INDEX "StudentActionLog_periodId_idx" ON "StudentActionLog"("periodId");

-- CreateIndex
CREATE INDEX "StudentActionLog_attemptId_idx" ON "StudentActionLog"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingDiscordReport_resultId_key" ON "PendingDiscordReport"("resultId");

-- CreateIndex
CREATE INDEX "PendingDiscordReport_createdAt_idx" ON "PendingDiscordReport"("createdAt");

-- CreateIndex
CREATE INDEX "PendingDiscordReport_deletedAt_idx" ON "PendingDiscordReport"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentPeriod_code_key" ON "RecruitmentPeriod"("code");

-- CreateIndex
CREATE INDEX "RecruitmentPeriod_isActive_idx" ON "RecruitmentPeriod"("isActive");

-- CreateIndex
CREATE INDEX "RecruitmentPeriod_deletedAt_idx" ON "RecruitmentPeriod"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_registrationId_key" ON "Application"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_accessTokenHash_key" ON "Application"("accessTokenHash");

-- CreateIndex
CREATE INDEX "Application_registrationId_idx" ON "Application"("registrationId");

-- CreateIndex
CREATE INDEX "Application_robloxUsername_idx" ON "Application"("robloxUsername");

-- CreateIndex
CREATE INDEX "Application_discordId_idx" ON "Application"("discordId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_recruitmentPeriodId_idx" ON "Application"("recruitmentPeriodId");

-- CreateIndex
CREATE INDEX "Application_deletedAt_idx" ON "Application"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_recruitmentPeriodId_robloxUsernameKey_key" ON "Application"("recruitmentPeriodId", "robloxUsernameKey");

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ExamPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAnswer" ADD CONSTRAINT "ExamAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAnswer" ADD CONSTRAINT "ExamAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ExamPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_recruitmentPeriodId_fkey" FOREIGN KEY ("recruitmentPeriodId") REFERENCES "RecruitmentPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

