import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker image (set in infra/docker/admin.Dockerfile).
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
};

export default config;
