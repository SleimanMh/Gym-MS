import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FeatureKey, Permission, PlatformRole } from "@gym/shared";
import { EntitlementsService } from "../modules/entitlements/entitlements.service";
import {
  AUTH_ONLY_KEY,
  FEATURES_KEY,
  MEMBER_KEY,
  PERMISSIONS_KEY,
  PLATFORM_KEY,
  PUBLIC_KEY,
} from "./decorators";
import { currentContext } from "./request-context";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Global guard. Deny by default: every route must be @Public, @MemberOnly, @AuthenticatedOnly,
 * @PlatformOnly or declare @RequiresPermission. Checks, in order:
 *   login → tenant → membership → read-only tenant → permissions → plan features.
 * Member tokens never carry staff permissions, so they get 403 on every staff endpoint.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const get = <T>(key: string) => this.reflector.getAllAndOverride<T | undefined>(key, targets);

    const ctx = currentContext();
    const method = context.switchToHttp().getRequest<{ method: string }>().method;

    const features = get<FeatureKey[]>(FEATURES_KEY);
    const checkFeatures = async () => {
      if (!features?.length || !ctx.tenant) return;
      const ent = await this.entitlements.get(ctx.tenant.id);
      const locked = features.find((f) => !ent.features.includes(f));
      if (locked) throw EntitlementsService.featureDenied(locked);
    };

    const publicOpts = get<{ tenant: boolean }>(PUBLIC_KEY);
    if (publicOpts) {
      if (publicOpts.tenant && !ctx.tenant) {
        throw new BadRequestException({ code: "TENANT_REQUIRED" });
      }
      await checkFeatures();
      return true;
    }

    if (get<boolean>(MEMBER_KEY)) {
      if (!ctx.member || !ctx.tenant) throw new UnauthorizedException();
      if (ctx.tenant.status === "read_only" && !READ_METHODS.has(method)) {
        throw new ForbiddenException({ code: "TENANT_READ_ONLY" });
      }
      await checkFeatures();
      return true;
    }

    const p = ctx.principal;
    // PLAN.md section 11: a member token on a staff endpoint is a 403, not a 401.
    if (!p && ctx.member) throw new ForbiddenException({ code: "MEMBERS_NOT_ALLOWED" });
    if (!p) throw new UnauthorizedException();

    const platformRoles = get<PlatformRole[]>(PLATFORM_KEY);
    if (platformRoles) {
      if (!p.platformRole || !platformRoles.includes(p.platformRole)) throw new ForbiddenException();
      if (p.platformRole === "support" && !READ_METHODS.has(method)) throw new ForbiddenException();
      return true;
    }

    if (get<boolean>(AUTH_ONLY_KEY)) return true;

    const permissions = get<Permission[]>(PERMISSIONS_KEY);
    if (!permissions?.length) {
      // A route that declares nothing is a bug, not an open door.
      throw new ForbiddenException({ code: "ROUTE_HAS_NO_ACCESS_RULE" });
    }

    if (!ctx.tenant) throw new BadRequestException({ code: "TENANT_REQUIRED" });
    if (!p.isTenantMember) throw new ForbiddenException({ code: "NOT_A_MEMBER_OF_TENANT" });
    if (ctx.tenant.status === "read_only" && !READ_METHODS.has(method)) {
      throw new ForbiddenException({ code: "TENANT_READ_ONLY" });
    }

    const missing = permissions.filter((x) => !p.permissions.includes(x));
    if (missing.length) throw new ForbiddenException({ code: "MISSING_PERMISSION", missing });

    await checkFeatures();
    return true;
  }
}
