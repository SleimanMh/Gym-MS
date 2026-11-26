import type { NextFunction, Request, Response } from "express";

const ALLOWED_HEADERS = "authorization, content-type, x-api-key, x-tenant-slug, x-request-id, idempotency-key";
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

/**
 * CORS for two kinds of callers:
 * - our admin app (ADMIN_ORIGINS): full API, with credentials;
 * - gym websites running the widget: only /v1/public/* and member self-service /v1/me/*, no cookies.
 *   Which website may call which gym is enforced per tenant in RequestContextMiddleware
 *   (allowed_origins), because a preflight request doesn't carry the API key to look it up.
 */
export function corsMiddleware(adminOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header("origin");
    if (origin) {
      res.vary("Origin");
      const widgetPath = /^\/v1\/(public|me)\//.test(req.path);
      if (adminOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      } else if (widgetPath) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
      res.setHeader("Access-Control-Expose-Headers", "x-request-id");
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
        res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
        res.setHeader("Access-Control-Max-Age", "600");
        res.status(204).end();
        return;
      }
    }
    next();
  };
}
