import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { ENV, type Env } from "../config/env";

/**
 * Small JSON cache: Redis when REDIS_URL is set (shared by all API instances and the worker),
 * otherwise in-process memory (local dev without Docker, unit tests).
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly log = new Logger(CacheService.name);
  private readonly redis: Redis | null;
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();

  constructor(@Inject(ENV) env: Env) {
    this.redis = env.REDIS_URL ? new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
    this.redis?.on("error", (e) => this.log.warn(`redis: ${e.message}`));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = this.redis ? await this.redis.get(key) : this.memGet(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null; // cache is an optimisation; fall through to the database
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const raw = JSON.stringify(value);
    try {
      if (this.redis) await this.redis.set(key, raw, "EX", ttlSeconds);
      else this.memory.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
    } catch {
      /* ignore */
    }
  }

  /** Increments a counter that expires `ttlSeconds` after its first hit (rate limiting). */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    try {
      if (this.redis) {
        const n = await this.redis.incr(key);
        if (n === 1) await this.redis.expire(key, ttlSeconds);
        return n;
      }
    } catch {
      /* fall back to memory */
    }
    const hit = this.memory.get(key);
    const n = hit && hit.expiresAt > Date.now() ? Number(hit.value) + 1 : 1;
    this.memory.set(key, { value: String(n), expiresAt: hit && n > 1 ? hit.expiresAt : Date.now() + ttlSeconds * 1000 });
    return n;
  }

  async del(key: string): Promise<void> {
    this.memory.delete(key);
    try {
      await this.redis?.del(key);
    } catch {
      /* ignore */
    }
  }

  private memGet(key: string): string | null {
    const hit = this.memory.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return hit.value;
  }

  async onModuleDestroy() {
    this.redis?.disconnect();
  }
}
