-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "fee_bearer" TEXT NOT NULL DEFAULT 'platform';
