import { SetMetadata } from "@nestjs/common";
import type { FeatureKey, Permission, PlatformRole } from "@gym/shared";

export const PUBLIC_KEY = "access:public";
export const PERMISSIONS_KEY = "access:permissions";
export const FEATURES_KEY = "access:features";
export const PLATFORM_KEY = "access:platform";
export const AUTH_ONLY_KEY = "access:authOnly";
export const MEMBER_KEY = "access:member";

/**
 * No login required. `tenant: true` still requires a tenant resolved from an API key or domain
 * (widget, hosted pages, public API).
 */
export const Public = (opts: { tenant?: boolean } = {}) => SetMetadata(PUBLIC_KEY, { tenant: opts.tenant ?? false });

/** Logged-in user, tenant optional (e.g. GET /v1/me, the gym picker). */
export const AuthenticatedOnly = () => SetMetadata(AUTH_ONLY_KEY, true);

/** Every listed permission is required (deny by default). */
export const RequiresPermission = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/** Tenant's plan must include every listed feature (PLAN.md section 7). */
export const RequiresFeature = (...features: FeatureKey[]) => SetMetadata(FEATURES_KEY, features);

/** Platform console (your side). No tenant context. */
export const PlatformOnly = (...roles: PlatformRole[]) => SetMetadata(PLATFORM_KEY, roles);

/** Signed-in gym member, acting on their own data only (/v1/me/...). Staff tokens get 401. */
export const MemberOnly = () => SetMetadata(MEMBER_KEY, true);
