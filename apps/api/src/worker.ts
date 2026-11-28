/**
 * Worker entrypoint — same codebase as the API (PLAN.md section 3).
 *
 * Repeating jobs (BullMQ job schedulers, so only one runs at a time across worker replicas):
 *   outbox.dispatch   every 5 s  — deliver domain events (emails today; webhooks in Phase 4)
 *   maintenance.scan  every 5 min — extend sessions, queue reminders / expiry emails, expire memberships
 *
 * Rule: tenant data is touched only through withTenant(), exactly like an API request.
 */
import "./config/load-dotenv";
import { Queue, Worker } from "bullmq";
import nodemailer from "nodemailer";
import { createPrismaClient } from "@gym/db";
import { loadEnv } from "./config/env";
import { dispatchOutbox, runMaintenance, type Mailer } from "./modules/notifications/jobs";

const QUEUE = "default";

async function main() {
  const env = loadEnv();
  if (!env.REDIS_URL) throw new Error("REDIS_URL is required for the worker");
  const prisma = createPrismaClient(env.DATABASE_URL);
  const { hostname, port, password } = new URL(env.REDIS_URL);
  const connection = { host: hostname, port: Number(port || 6379), password: password || undefined };

  const transport = nodemailer.createTransport(env.SMTP_URL);
  const mailer: Mailer = {
    async send(msg) {
      await transport.sendMail({ from: env.MAIL_FROM, ...msg });
    },
  };
  const cfg = { publicAppUrl: env.PUBLIC_APP_URL, gymUrlTemplate: env.GYM_URL_TEMPLATE };

  const queue = new Queue(QUEUE, { connection });
  await queue.upsertJobScheduler("outbox.dispatch", { every: 5_000 }, { name: "outbox.dispatch" });
  await queue.upsertJobScheduler("maintenance.scan", { every: 5 * 60_000 }, { name: "maintenance.scan" });

  const worker = new Worker(
    QUEUE,
    async (job) => {
      switch (job.name) {
        case "outbox.dispatch":
          return { processed: await dispatchOutbox(prisma, mailer, cfg) };
        case "maintenance.scan":
          return runMaintenance(prisma);
        default:
          throw new Error(`No handler for job ${job.name}`);
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on("completed", (job, result) => {
    if (job.name === "maintenance.scan" || (result as { processed?: number })?.processed) {
      console.log(JSON.stringify({ job: job.name, result }));
    }
  });
  worker.on("failed", (job, err) => console.error(JSON.stringify({ job: job?.name, error: err.message })));
  console.log("Worker started: outbox.dispatch every 5s, maintenance.scan every 5min");

  // Run maintenance once at startup so a fresh environment has sessions immediately.
  await queue.add("maintenance.scan", {}, { removeOnComplete: true });

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

void main();
