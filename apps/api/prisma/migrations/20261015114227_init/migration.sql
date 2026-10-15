-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PLAYER', 'ADMIN', 'SUPPORT', 'FINANCE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'am');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER', 'RESET', 'ADMIN_2FA');

-- CreateEnum
CREATE TYPE "WalletKind" AS ENUM ('PLAYER', 'HOUSE');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('DEPOSIT', 'STAKE', 'REFUND', 'PRIZE', 'COMMISSION', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('TELEBIRR', 'CBE');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('VERIFYING', 'CREDITED', 'UNDER_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'FROZEN', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('OPEN', 'DRAWING', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FlagSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "FlagSubject" AS ENUM ('DEPOSIT', 'USER', 'WITHDRAWAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "language" "Language" NOT NULL DEFAULT 'en',
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "banReason" TEXT,
    "bannedUntil" TIMESTAMP(3),
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "device" TEXT,
    "fingerprint" TEXT,
    "ip" TEXT,
    "twoFactor" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ip" TEXT,
    "device" TEXT,
    "fingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "kind" "WalletKind" NOT NULL DEFAULT 'PLAYER',
    "balanceCents" BIGINT NOT NULL DEFAULT 0,
    "lockedCents" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "claimedAmountCents" INTEGER NOT NULL,
    "creditedCents" INTEGER,
    "reference" TEXT,
    "referenceInput" TEXT,
    "senderAccountHint" TEXT,
    "imageKey" TEXT,
    "rawReceiptKey" TEXT,
    "parsedJson" JSONB,
    "status" "DepositStatus" NOT NULL DEFAULT 'VERIFYING',
    "flagReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "highestSeverity" "FlagSeverity",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "used_references" (
    "provider" "Provider" NOT NULL,
    "reference" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "used_references_pkey" PRIMARY KEY ("provider","reference")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "Provider" NOT NULL,
    "destAccount" TEXT NOT NULL,
    "destName" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "gameId" TEXT,
    "transferRef" TEXT,
    "receiptKey" TEXT,
    "rejectReason" TEXT,
    "paidBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "stakeCents" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "minPlayers" INTEGER NOT NULL DEFAULT 2,
    "commissionBps" INTEGER NOT NULL DEFAULT 2000,
    "deadlineMinutes" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "stakeCents" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "minPlayers" INTEGER NOT NULL DEFAULT 2,
    "commissionBps" INTEGER NOT NULL DEFAULT 2000,
    "status" "GameStatus" NOT NULL DEFAULT 'OPEN',
    "deadlineAt" TIMESTAMP(3),
    "seedHash" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "winningNumber" INTEGER,
    "winnerUserId" TEXT,
    "winnerIndex" INTEGER,
    "potCents" INTEGER,
    "prizeCents" INTEGER,
    "commissionCents" INTEGER,
    "spinStartAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "drawnAt" TIMESTAMP(3),

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_entries" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flags" (
    "id" TEXT NOT NULL,
    "subjectType" "FlagSubject" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "userId" TEXT,
    "severity" "FlagSeverity" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "FlagStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "until" TIMESTAMP(3),
    "bannedBy" TEXT NOT NULL,
    "liftedBy" TEXT,
    "liftedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("userId","key")
);

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "telebirrCents" BIGINT NOT NULL,
    "cbeCents" BIGINT NOT NULL,
    "walletsCents" BIGINT NOT NULL,
    "lockedCents" BIGINT NOT NULL,
    "houseCents" BIGINT NOT NULL,
    "differenceCents" BIGINT NOT NULL,
    "enteredBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "otp_codes_phone_purpose_idx" ON "otp_codes"("phone", "purpose");

-- CreateIndex
CREATE INDEX "otp_codes_ip_createdAt_idx" ON "otp_codes"("ip", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_fingerprint_idx" ON "sessions"("fingerprint");

-- CreateIndex
CREATE INDEX "login_events_userId_createdAt_idx" ON "login_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "login_events_ip_idx" ON "login_events"("ip");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");

-- CreateIndex
CREATE INDEX "ledger_entries_walletId_createdAt_idx" ON "ledger_entries"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_refType_refId_idx" ON "ledger_entries"("refType", "refId");

-- CreateIndex
CREATE INDEX "deposits_userId_createdAt_idx" ON "deposits"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "deposits_status_idx" ON "deposits"("status");

-- CreateIndex
CREATE INDEX "deposits_provider_reference_idx" ON "deposits"("provider", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "used_references_depositId_key" ON "used_references"("depositId");

-- CreateIndex
CREATE INDEX "withdrawals_status_createdAt_idx" ON "withdrawals"("status", "createdAt");

-- CreateIndex
CREATE INDEX "withdrawals_destAccount_idx" ON "withdrawals"("destAccount");

-- CreateIndex
CREATE INDEX "games_status_idx" ON "games"("status");

-- CreateIndex
CREATE INDEX "game_entries_userId_idx" ON "game_entries"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "game_entries_gameId_number_key" ON "game_entries"("gameId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "game_entries_gameId_userId_key" ON "game_entries"("gameId", "userId");

-- CreateIndex
CREATE INDEX "flags_status_severity_idx" ON "flags"("status", "severity");

-- CreateIndex
CREATE INDEX "flags_userId_createdAt_idx" ON "flags"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "flags_subjectType_subjectId_idx" ON "flags"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "bans_userId_idx" ON "bans"("userId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "audit_log_actorId_idx" ON "audit_log"("actorId");

-- CreateIndex
CREATE INDEX "audit_log_targetType_targetId_idx" ON "audit_log"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "reconciliations_date_idx" ON "reconciliations"("date");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "room_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_entries" ADD CONSTRAINT "game_entries_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_entries" ADD CONSTRAINT "game_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bans" ADD CONSTRAINT "bans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Integrity guards enforced by the database, not just the code =====

-- REQ-WAL-03: balances can never go negative.
ALTER TABLE "wallets" ADD CONSTRAINT "wallet_balance_non_negative" CHECK ("balanceCents" >= 0 OR "kind" = 'HOUSE');
ALTER TABLE "wallets" ADD CONSTRAINT "wallet_locked_non_negative" CHECK ("lockedCents" >= 0);
ALTER TABLE "game_entries" ADD CONSTRAINT "entry_number_range" CHECK ("number" BETWEEN 1 AND 100);
ALTER TABLE "games" ADD CONSTRAINT "game_capacity_range" CHECK ("capacity" BETWEEN 2 AND 100);

-- REQ-WAL-02 / audit log: append-only tables.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- REQ-GAME-11 / REQ-ADM-04: once a result is stored it can never change, including by admins.
CREATE OR REPLACE FUNCTION games_result_write_once() RETURNS trigger AS $$
BEGIN
  IF OLD."winningNumber" IS NOT NULL AND (
       NEW."winningNumber" IS DISTINCT FROM OLD."winningNumber" OR
       NEW."winnerUserId"  IS DISTINCT FROM OLD."winnerUserId"  OR
       NEW."winnerIndex"   IS DISTINCT FROM OLD."winnerIndex"   OR
       NEW."seed"          IS DISTINCT FROM OLD."seed"          OR
       NEW."seedHash"      IS DISTINCT FROM OLD."seedHash"      OR
       NEW."potCents"      IS DISTINCT FROM OLD."potCents"      OR
       NEW."prizeCents"    IS DISTINCT FROM OLD."prizeCents"    OR
       NEW."drawnAt"       IS DISTINCT FROM OLD."drawnAt") THEN
    RAISE EXCEPTION 'game result is write-once';
  END IF;
  IF NEW."seedHash" IS DISTINCT FROM OLD."seedHash" OR NEW."seed" IS DISTINCT FROM OLD."seed" THEN
    RAISE EXCEPTION 'game seed commitment is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER games_result_guard BEFORE UPDATE ON "games"
  FOR EACH ROW EXECUTE FUNCTION games_result_write_once();
CREATE TRIGGER games_no_delete BEFORE DELETE ON "games"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
