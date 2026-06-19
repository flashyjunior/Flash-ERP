-- AlterTable
ALTER TABLE "Store" ADD COLUMN "salesReceiptTemplateId" TEXT;

-- CreateTable
CREATE TABLE "ReceiptTemplate" (
    "id" TEXT NOT NULL,
    "retailOrgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templateHtml" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "paperWidthMm" INTEGER NOT NULL DEFAULT 80,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptTemplate_retailOrgId_code_key" ON "ReceiptTemplate"("retailOrgId", "code");

-- AddForeignKey
ALTER TABLE "ReceiptTemplate"
ADD CONSTRAINT "ReceiptTemplate_retailOrgId_fkey"
FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store"
ADD CONSTRAINT "Store_salesReceiptTemplateId_fkey"
FOREIGN KEY ("salesReceiptTemplateId") REFERENCES "ReceiptTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
