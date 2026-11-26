/** @type {import('jest').Config} */
const base = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }] },
};

module.exports = {
  testTimeout: 30000,
  projects: [
    { ...base, displayName: "unit", testMatch: ["<rootDir>/test/unit/**/*.spec.ts"] },
    {
      ...base,
      displayName: "isolation",
      testMatch: ["<rootDir>/test/isolation/**/*.spec.ts"],
      setupFiles: ["<rootDir>/test/load-env.js"],
    },
  ],
};
