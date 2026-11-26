import "reflect-metadata";
import "./config/load-dotenv";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";

async function bootstrap() {
  const env = loadEnv(); // fail fast on bad config
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
  Logger.log(`API listening on http://localhost:${env.API_PORT}`, "bootstrap");
}

void bootstrap();
