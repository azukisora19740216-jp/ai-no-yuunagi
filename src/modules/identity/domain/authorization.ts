import type { RoleName } from "@/generated/prisma/enums";
import { AppError } from "@/shared/errors/app-error";

export type Permission =
  | "profile:update-own"
  | "item:create"
  | "item:submit-own"
  | "item:review"
  | "item-request:create"
  | "item-request:select-own"
  | "transaction:accept-own"
  | "transaction:schedule-own"
  | "transaction:report-own"
  | "transaction:review"
  | "transaction:read-all"
  | "points:view-own"
  | "points:read-all"
  | "points:reverse"
  | "points:common-pool"
  | "points:expire"
  | "audit:read"
  | "pilot:manage"
  | "kyc:review";

const permissionRoles: Record<Permission, readonly RoleName[]> = {
  "profile:update-own": ["USER"],
  "item:create": ["USER"],
  "item:submit-own": ["USER"],
  "item:review": ["MODERATOR", "ADMINISTRATOR"],
  "item-request:create": ["USER"],
  "item-request:select-own": ["USER"],
  "transaction:accept-own": ["USER"],
  "transaction:schedule-own": ["USER"],
  "transaction:report-own": ["USER"],
  "transaction:review": ["MODERATOR", "ADMINISTRATOR"],
  "transaction:read-all": ["MODERATOR", "ADMINISTRATOR", "AUDITOR"],
  "points:view-own": ["USER"],
  "points:read-all": ["MODERATOR", "ADMINISTRATOR", "AUDITOR"],
  "points:reverse": ["ADMINISTRATOR"],
  "points:common-pool": ["ADMINISTRATOR"],
  "points:expire": ["ADMINISTRATOR"],
  "audit:read": ["MODERATOR", "ADMINISTRATOR", "AUDITOR"],
  "pilot:manage": ["ADMINISTRATOR"],
  "kyc:review": ["ADMINISTRATOR"],
};

export function hasPermission(roles: readonly RoleName[], permission: Permission): boolean {
  return permissionRoles[permission].some((role) => roles.includes(role));
}

export function requirePermission(roles: readonly RoleName[], permission: Permission): void {
  if (!hasPermission(roles, permission)) {
    throw new AppError("FORBIDDEN", "この操作を行う権限がありません。", 403);
  }
}
