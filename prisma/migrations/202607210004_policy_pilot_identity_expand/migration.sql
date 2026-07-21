-- PD-01/02/03 expand-only policy, pilot, invitation, consent, and KYC foundations.
-- Existing tables and rows are not rewritten.
CREATE TYPE "policy_version_status" AS ENUM ('DEVELOPMENT', 'APPROVED', 'SUSPENDED');
CREATE TYPE "invitation_status" AS ENUM ('ISSUED', 'USED', 'EXPIRED', 'REVOKED');
CREATE TYPE "consent_record_type" AS ENUM ('TERMS', 'PRIVACY', 'AGE_18_PLUS', 'ONE_ACCOUNT');
CREATE TYPE "pilot_membership_status" AS ENUM ('PROVISIONAL', 'ACTIVE', 'SUSPENDED', 'WITHDRAWN');
CREATE TYPE "kyc_status" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

CREATE TABLE "service_policy_versions" (
  "id" UUID NOT NULL,
  "version" TEXT NOT NULL,
  "terms_version" TEXT NOT NULL,
  "privacy_version" TEXT NOT NULL,
  "status" "policy_version_status" NOT NULL DEFAULT 'DEVELOPMENT',
  "requires_reconsent" BOOLEAN NOT NULL DEFAULT true,
  "effective_from" TIMESTAMPTZ(6) NOT NULL,
  "approved_at" TIMESTAMPTZ(6),
  "approved_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_policy_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_policy_approval_shape" CHECK (
    ("status" = 'APPROVED' AND "approved_at" IS NOT NULL AND "approved_by_id" IS NOT NULL)
    OR "status" <> 'APPROVED'
  )
);
CREATE UNIQUE INDEX "service_policy_versions_version_key" ON "service_policy_versions"("version");
CREATE INDEX "service_policy_versions_status_effective_from_idx" ON "service_policy_versions"("status", "effective_from");
ALTER TABLE "service_policy_versions" ADD CONSTRAINT "service_policy_versions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "pilot_settings" (
  "id" UUID NOT NULL,
  "policy_version_id" UUID NOT NULL,
  "region_label" TEXT NOT NULL,
  "allowed_area_keys" JSONB NOT NULL,
  "registration_limit" INTEGER NOT NULL,
  "invite_only" BOOLEAN NOT NULL DEFAULT true,
  "nationwide_public_enabled" BOOLEAN NOT NULL DEFAULT false,
  "effective_from" TIMESTAMPTZ(6) NOT NULL,
  "effective_to" TIMESTAMPTZ(6),
  "approved_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pilot_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_registration_limit_positive" CHECK ("registration_limit" > 0),
  CONSTRAINT "pilot_effective_period_valid" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);
CREATE UNIQUE INDEX "pilot_settings_policy_version_id_key" ON "pilot_settings"("policy_version_id");
CREATE INDEX "pilot_settings_effective_from_effective_to_idx" ON "pilot_settings"("effective_from", "effective_to");
ALTER TABLE "pilot_settings" ADD CONSTRAINT "pilot_settings_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "service_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pilot_settings" ADD CONSTRAINT "pilot_settings_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "invitations" (
  "id" UUID NOT NULL,
  "code_hash" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" "invitation_status" NOT NULL DEFAULT 'ISSUED',
  "counts_toward_limit" BOOLEAN NOT NULL DEFAULT true,
  "issued_by_user_id" UUID NOT NULL,
  "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "used_by_user_id" UUID,
  "revoked_at" TIMESTAMPTZ(6),
  "revoked_by_user_id" UUID,
  "revoke_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invitation_expiry_after_issue" CHECK ("expires_at" > "issued_at"),
  CONSTRAINT "invitation_status_shape" CHECK (
    ("status" = 'ISSUED' AND "used_at" IS NULL AND "used_by_user_id" IS NULL AND "revoked_at" IS NULL)
    OR ("status" = 'USED' AND "used_at" IS NOT NULL AND "used_by_user_id" IS NOT NULL AND "revoked_at" IS NULL)
    OR ("status" = 'EXPIRED' AND "used_at" IS NULL AND "used_by_user_id" IS NULL AND "revoked_at" IS NULL)
    OR ("status" = 'REVOKED' AND "used_at" IS NULL AND "used_by_user_id" IS NULL AND "revoked_at" IS NOT NULL AND "revoked_by_user_id" IS NOT NULL AND "revoke_reason" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "invitations_code_hash_key" ON "invitations"("code_hash");
CREATE UNIQUE INDEX "invitations_used_by_user_id_key" ON "invitations"("used_by_user_id");
CREATE INDEX "invitations_status_expires_at_idx" ON "invitations"("status", "expires_at");
CREATE INDEX "invitations_issued_by_user_id_issued_at_idx" ON "invitations"("issued_by_user_id", "issued_at");
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_used_by_user_id_fkey" FOREIGN KEY ("used_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "pilot_memberships" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "invitation_id" UUID NOT NULL,
  "area_key" TEXT NOT NULL,
  "account_type" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
  "status" "pilot_membership_status" NOT NULL DEFAULT 'PROVISIONAL',
  "counts_toward_limit" BOOLEAN NOT NULL DEFAULT true,
  "one_account_attested_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "pilot_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_membership_individual_only" CHECK ("account_type" = 'INDIVIDUAL')
);
CREATE UNIQUE INDEX "pilot_memberships_user_id_key" ON "pilot_memberships"("user_id");
CREATE UNIQUE INDEX "pilot_memberships_invitation_id_key" ON "pilot_memberships"("invitation_id");
CREATE INDEX "pilot_memberships_status_counts_toward_limit_created_at_idx" ON "pilot_memberships"("status", "counts_toward_limit", "created_at");
CREATE INDEX "pilot_memberships_area_key_status_idx" ON "pilot_memberships"("area_key", "status");
ALTER TABLE "pilot_memberships" ADD CONSTRAINT "pilot_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pilot_memberships" ADD CONSTRAINT "pilot_memberships_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "consent_records" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "policy_version_id" UUID NOT NULL,
  "record_type" "consent_record_type" NOT NULL,
  "document_version" TEXT NOT NULL,
  "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL,
  "evidence_hash" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "consent_records_user_id_record_type_document_version_key" ON "consent_records"("user_id", "record_type", "document_version");
CREATE INDEX "consent_records_user_id_confirmed_at_idx" ON "consent_records"("user_id", "confirmed_at");
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "service_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "kyc_cases" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "status" "kyc_status" NOT NULL,
  "subject_reference_hash" TEXT,
  "valid_from" TIMESTAMPTZ(6),
  "valid_until" TIMESTAMPTZ(6),
  "submitted_at" TIMESTAMPTZ(6),
  "decided_at" TIMESTAMPTZ(6),
  "reason_code" TEXT,
  "reviewed_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kyc_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kyc_valid_period" CHECK ("valid_until" IS NULL OR "valid_from" IS NULL OR "valid_until" > "valid_from"),
  CONSTRAINT "kyc_verified_shape" CHECK ("status" <> 'VERIFIED' OR ("subject_reference_hash" IS NOT NULL AND "valid_from" IS NOT NULL AND "decided_at" IS NOT NULL))
);
CREATE INDEX "kyc_cases_user_id_created_at_idx" ON "kyc_cases"("user_id", "created_at");
CREATE INDEX "kyc_cases_status_valid_until_idx" ON "kyc_cases"("status", "valid_until");
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "kyc_subject_claims" (
  "id" UUID NOT NULL,
  "subject_reference_hash" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "first_kyc_case_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kyc_subject_claims_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "kyc_subject_claims_subject_reference_hash_key" ON "kyc_subject_claims"("subject_reference_hash");
CREATE UNIQUE INDEX "kyc_subject_claims_user_id_key" ON "kyc_subject_claims"("user_id");
CREATE UNIQUE INDEX "kyc_subject_claims_first_kyc_case_id_key" ON "kyc_subject_claims"("first_kyc_case_id");
ALTER TABLE "kyc_subject_claims" ADD CONSTRAINT "kyc_subject_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kyc_subject_claims" ADD CONSTRAINT "kyc_subject_claims_first_kyc_case_id_fkey" FOREIGN KEY ("first_kyc_case_id") REFERENCES "kyc_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Policy, consent, KYC decisions, and uniqueness claims are append-only.
CREATE TRIGGER "service_policy_versions_immutable"
BEFORE UPDATE OR DELETE ON "service_policy_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_phase2_immutable_mutation();
CREATE TRIGGER "pilot_settings_immutable"
BEFORE UPDATE OR DELETE ON "pilot_settings"
FOR EACH ROW EXECUTE FUNCTION prevent_phase2_immutable_mutation();
CREATE TRIGGER "consent_records_immutable"
BEFORE UPDATE OR DELETE ON "consent_records"
FOR EACH ROW EXECUTE FUNCTION prevent_phase2_immutable_mutation();
CREATE TRIGGER "kyc_cases_immutable"
BEFORE UPDATE OR DELETE ON "kyc_cases"
FOR EACH ROW EXECUTE FUNCTION prevent_phase2_immutable_mutation();
CREATE TRIGGER "kyc_subject_claims_immutable"
BEFORE UPDATE OR DELETE ON "kyc_subject_claims"
FOR EACH ROW EXECUTE FUNCTION prevent_phase2_immutable_mutation();
