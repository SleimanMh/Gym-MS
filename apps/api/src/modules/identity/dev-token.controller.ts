import { Body, Controller, ForbiddenException, NotFoundException, Post } from "@nestjs/common";
import { devTokenSchema, type DevTokenInput } from "@gym/shared";
import { Public } from "../../common/decorators";
import { ZodPipe } from "../../common/zod.pipe";
import { PrismaService } from "../../infra/prisma.service";
import { AuthService } from "./auth.service";
import { IdentityService } from "./identity.service";

/**
 * DEVELOPMENT ONLY — registered by IdentityModule only when AUTH_DEV_TOKENS=true, which config
 * validation refuses in production. Lets you act as any seeded user without Keycloak running.
 */
@Controller("v1/dev")
export class DevTokenController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly identity: IdentityService,
  ) {}

  @Post("token")
  @Public()
  async token(@Body(new ZodPipe(devTokenSchema)) body: DevTokenInput) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user?.authSubject) throw new NotFoundException({ code: "USER_NOT_FOUND" });

    let tenantId: string | null = null;
    if (body.tenantSlug) {
      const tenants = await this.identity.tenantsForUser(user.id);
      const match = tenants.find((t) => t.slug === body.tenantSlug);
      if (!match) throw new ForbiddenException({ code: "NOT_A_MEMBER_OF_TENANT" });
      tenantId = match.tenantId;
    }

    const accessToken = await this.auth.mintDevToken({ subject: user.authSubject, email: user.email, tenantId });
    return { accessToken, tokenType: "Bearer", expiresIn: 12 * 3600 };
  }
}
