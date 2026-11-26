import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().optional(),
    ADMIN_ORIGINS: z
      .string()
      .default("http://localhost:3000")
      .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
    APP_ROOT_DOMAIN: z.string().default("localhost"),
    KEYCLOAK_ISSUER: z.string().url().default("http://localhost:8080/realms/gym"),
    KEYCLOAK_AUDIENCE: z.string().default("gym-api"),
    /**
     * Keycloak as the API/worker reach it (in Docker: http://keycloak:8080). Defaults to the issuer's
     * origin. Used for user provisioning; token checks always use KEYCLOAK_ISSUER.
     */
    KEYCLOAK_INTERNAL_URL: z.string().url().optional(),
    /** Service-account client that creates staff accounts and sends set-password emails. Unset secret = invites skipped. */
    KEYCLOAK_ADMIN_CLIENT_ID: z.string().default("gym-api-admin"),
    KEYCLOAK_ADMIN_CLIENT_SECRET: z.string().min(8).optional(),
    AUTH_DEV_TOKENS: bool.default("false"),
    DEV_JWT_SECRET: z.string().min(32).optional(),
    /** Signs member sessions after an email-code login. */
    MEMBER_JWT_SECRET: z.string().min(32),
    /** Pepper for one-time login codes. */
    CODE_PEPPER: z.string().min(16).default("dev-only-code-pepper"),
    SMTP_URL: z.string().default("smtp://localhost:1025"),
    MAIL_FROM: z.string().default("Gym Manager <no-reply@gym.local>"),
    /** Public origin of the admin app / hosted booking pages (links in emails). */
    PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_DEV_TOKENS && env.NODE_ENV === "production") {
      ctx.addIssue({ code: "custom", path: ["AUTH_DEV_TOKENS"], message: "must be false in production" });
    }
    if (env.AUTH_DEV_TOKENS && !env.DEV_JWT_SECRET) {
      ctx.addIssue({ code: "custom", path: ["DEV_JWT_SECRET"], message: "required when AUTH_DEV_TOKENS=true" });
    }
    if (env.NODE_ENV === "production" && env.CODE_PEPPER === "dev-only-code-pepper") {
      ctx.addIssue({ code: "custom", path: ["CODE_PEPPER"], message: "set a real value in production" });
    }
    if (env.DATABASE_URL.includes("gym_owner")) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "the API must connect as the app role (gym_app), never the owner role",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validated once at startup; the process exits with a readable message if config is wrong. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  // Empty values (e.g. `REDIS_URL=`) mean "not set".
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

export const ENV = Symbol("ENV");
