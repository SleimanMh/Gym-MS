import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker image (set in infra/docker/admin.Dockerfile).
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  // Each gym has its own address (ironfit.localhost:3000) — let them load dev assets too.
  allowedDevOrigins: ["*.localhost"],
};

export default config;
