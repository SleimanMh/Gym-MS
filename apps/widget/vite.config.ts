import { defineConfig } from "vite";

/**
 * One small bundle for gym websites (PLAN.md section 10):
 *   dist/gym-widget.js      — classic <script defer> (IIFE)
 *   dist/gym-widget.mjs     — <script type="module">
 * Published to the CDN as /widget/v1.x.y.js with a stable /widget/v1.js alias.
 */
export default defineConfig({
  server: { port: 5173, cors: true },
  build: {
    target: "es2020",
    lib: {
      entry: "src/index.ts",
      name: "GymWidget",
      formats: ["iife", "es"],
      fileName: (format) => (format === "es" ? "gym-widget.mjs" : "gym-widget.js"),
    },
    reportCompressedSize: true,
  },
});
