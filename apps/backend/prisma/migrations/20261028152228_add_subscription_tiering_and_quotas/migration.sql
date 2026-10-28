-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'STARTER', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "customBrandingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kdsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxBranches" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "maxStaff" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "maxTables" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "subscriptionPlan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- RenameIndex
ALTER INDEX "verifactu_records_chain_key" RENAME TO "verifactu_records_restaurantId_issuerNif_environment_seq_key";

-- RenameIndex
ALTER INDEX "verifactu_records_number_key" RENAME TO "verifactu_records_restaurantId_issuerNif_environment_invoic_key";
