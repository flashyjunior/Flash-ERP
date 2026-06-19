-- CreateEnum
CREATE TYPE "SecurityLogKind" AS ENUM ('AUDIT', 'SECURITY');

-- CreateEnum
CREATE TYPE "SecurityLogSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- AlterTable
ALTER TABLE "RetailOrg" ADD COLUMN     "companySettingsJson" JSONB,
ADD COLUMN     "ldapSettingsJson" JSONB,
ADD COLUMN     "optionsSettingsJson" JSONB,
ADD COLUMN     "passwordPolicyJson" JSONB,
ADD COLUMN     "smsSettingsJson" JSONB,
ADD COLUMN     "smtpSettingsJson" JSONB;

-- CreateTable
CREATE TABLE "SecurityLog" (
    "id" TEXT NOT NULL,
    "retailOrgId" TEXT NOT NULL,
    "kind" "SecurityLogKind" NOT NULL,
    "severity" "SecurityLogSeverity" NOT NULL DEFAULT 'INFO',
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "targetType" TEXT,
    "targetRef" TEXT,
    "sourceNodeCode" TEXT,
    "message" TEXT NOT NULL,
    "detailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityLog_retailOrgId_createdAt_idx" ON "SecurityLog"("retailOrgId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityLog_retailOrgId_kind_createdAt_idx" ON "SecurityLog"("retailOrgId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityLog_retailOrgId_category_createdAt_idx" ON "SecurityLog"("retailOrgId", "category", "createdAt");

-- AddForeignKey
ALTER TABLE "SecurityLog" ADD CONSTRAINT "SecurityLog_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
