import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/coverage/**", "**/next-env.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain CommonJS config/setup files (jest config, test env loaders).
    files: ["**/*.js", "**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { require: "readonly", module: "writable", __dirname: "readonly", process: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Raw SQL must go through tagged templates ($queryRaw / $executeRaw), never string concatenation.
      "no-restricted-properties": [
        "error",
        { property: "$queryRawUnsafe", message: "Use the $queryRaw tagged template." },
        { property: "$executeRawUnsafe", message: "Use the $executeRaw tagged template." },
      ],
    },
  },
);
