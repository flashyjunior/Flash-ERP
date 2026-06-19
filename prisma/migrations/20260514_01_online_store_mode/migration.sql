ALTER TABLE "Store"
ADD COLUMN IF NOT EXISTS "storeMode" TEXT NOT NULL DEFAULT 'OFFLINE_FIRST';

CREATE INDEX IF NOT EXISTS "Store_retailOrgId_storeMode_idx" ON "Store"("retailOrgId", "storeMode");
