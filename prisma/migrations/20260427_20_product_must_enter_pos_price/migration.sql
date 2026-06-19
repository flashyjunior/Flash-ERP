-- Add POS open-price product control.
ALTER TABLE "Product" ADD COLUMN "mustEnterPriceAtPos" BOOLEAN NOT NULL DEFAULT false;
