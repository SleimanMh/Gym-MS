import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../../common/decorators";
import { PrismaService } from "../../infra/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("live")
  @Public()
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  @Public()
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "ok" };
    } catch {
      throw new ServiceUnavailableException({ status: "unavailable", database: "down" });
    }
  }
}
