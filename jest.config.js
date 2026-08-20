module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  clearMocks: true,
  // Runs before any test module is imported, so `import "dotenv/config"` inside `src/config`
  // is already inert by the time the first suite reaches it. See `test/setupEnv.ts`.
  setupFiles: ["<rootDir>/test/setupEnv.ts"],
};
