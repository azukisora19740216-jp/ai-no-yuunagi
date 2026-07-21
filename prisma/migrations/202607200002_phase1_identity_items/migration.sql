-- Phase 1: authentication, membership, listings, review, and recipient requests.
CREATE TYPE "role_name" AS ENUM ('USER', 'MODERATOR', 'DONATION_REVIEWER', 'ADMINISTRATOR', 'AUDITOR');
CREATE TYPE "item_status" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'RESERVED', 'HANDOVER_IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED', 'SUSPENDED');
CREATE TYPE "item_condition" AS ENUM ('UNUSED', 'GOOD', 'USED', 'NEEDS_REPAIR');
CREATE TYPE "delivery_method" AS ENUM ('HANDOVER', 'SHIPPING');
CREATE TYPE "item_request_status" AS ENUM ('REQUESTED', 'SELECTED', 'NOT_SELECTED', 'WITHDRAWN', 'EXPIRED', 'CANCELLED');

ALTER TABLE "users" ADD COLUMN "name" TEXT NOT NULL DEFAULT '会員';
ALTER TABLE "users" ADD COLUMN "email" TEXT;
UPDATE "users" SET "email" = "email_normalized";
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "users" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false;
UPDATE "users" SET "email_verified" = ("email_verified_at" IS NOT NULL);
ALTER TABLE "users" ADD COLUMN "image" TEXT;
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
ALTER TABLE "users" DROP COLUMN "password_hash";
ALTER TABLE "users" DROP COLUMN "email_verified_at";
DROP INDEX IF EXISTS "users_email_normalized_key";
ALTER TABLE "users" DROP COLUMN "email_normalized";

CREATE TABLE "sessions" (
  "id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "token" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "user_id" UUID NOT NULL,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "accounts" (
  "id" UUID NOT NULL,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" TIMESTAMPTZ(6),
  "refresh_token_expires_at" TIMESTAMPTZ(6),
  "scope" TEXT,
  "password" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");
CREATE UNIQUE INDEX "accounts_provider_id_account_id_key" ON "accounts"("provider_id", "account_id");
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "verifications" (
  "id" UUID NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6),
  CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

CREATE TABLE "user_roles" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "role_name" NOT NULL,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assigned_by_id" UUID,
  "reason" TEXT NOT NULL,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_roles_user_id_role_key" ON "user_roles"("user_id", "role");
CREATE INDEX "user_roles_role_idx" ON "user_roles"("role");
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "profiles" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "display_name" TEXT NOT NULL,
  "bio" TEXT,
  "handover_area" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "categories" (
  "id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "risk_level" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "requires_review" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");
CREATE INDEX "categories_active_name_idx" ON "categories"("active", "name");

CREATE TABLE "items" (
  "id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "condition" "item_condition" NOT NULL,
  "defect_description" TEXT,
  "delivery_method" "delivery_method" NOT NULL,
  "handover_area" TEXT NOT NULL,
  "available_dates" JSONB NOT NULL,
  "shipping_supported" BOOLEAN NOT NULL DEFAULT false,
  "status" "item_status" NOT NULL DEFAULT 'DRAFT',
  "review_reason" TEXT,
  "published_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "items_owner_user_id_status_created_at_idx" ON "items"("owner_user_id", "status", "created_at");
CREATE INDEX "items_status_published_at_idx" ON "items"("status", "published_at");
CREATE INDEX "items_category_id_status_idx" ON "items"("category_id", "status");
ALTER TABLE "items" ADD CONSTRAINT "items_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "item_images" (
  "id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "storage_key" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "display_order" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "item_images_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "item_images_item_id_display_order_key" ON "item_images"("item_id", "display_order");
ALTER TABLE "item_images" ADD CONSTRAINT "item_images_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "item_review_events" (
  "id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "reviewer_user_id" UUID NOT NULL,
  "from_status" "item_status" NOT NULL,
  "to_status" "item_status" NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "item_review_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "item_review_events_item_id_created_at_idx" ON "item_review_events"("item_id", "created_at");
CREATE INDEX "item_review_events_reviewer_user_id_created_at_idx" ON "item_review_events"("reviewer_user_id", "created_at");
ALTER TABLE "item_review_events" ADD CONSTRAINT "item_review_events_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "item_requests" (
  "id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "requester_user_id" UUID NOT NULL,
  "message" TEXT NOT NULL,
  "status" "item_request_status" NOT NULL DEFAULT 'REQUESTED',
  "selected_at" TIMESTAMPTZ(6),
  "selected_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "item_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "item_requests_item_id_requester_user_id_key" ON "item_requests"("item_id", "requester_user_id");
CREATE UNIQUE INDEX "item_requests_one_selected_per_item" ON "item_requests"("item_id") WHERE "status" = 'SELECTED';
CREATE INDEX "item_requests_requester_user_id_status_created_at_idx" ON "item_requests"("requester_user_id", "status", "created_at");
CREATE INDEX "item_requests_item_id_status_created_at_idx" ON "item_requests"("item_id", "status", "created_at");
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_selected_by_user_id_fkey" FOREIGN KEY ("selected_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "mock_emails" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "recipient_email" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "action_url" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mock_emails_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mock_emails_recipient_email_created_at_idx" ON "mock_emails"("recipient_email", "created_at");
ALTER TABLE "mock_emails" ADD CONSTRAINT "mock_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
