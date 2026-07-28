module.exports = {
  root: true,
  env: {
    node: true,
    jest: true,
    es2021: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "import"],
  extends: ["airbnb-base", "plugin:@typescript-eslint/recommended"],
  settings: {
    "import/resolver": {
      node: { extensions: [".js", ".ts"] },
    },
  },
  rules: {
    quotes: ["error", "double"],
    "no-underscore-dangle": "off",
    "no-param-reassign": "off",
    camelcase: "off",
    "import/prefer-default-export": "off",
    "import/extensions": ["error", "ignorePackages", { ts: "never" }],
    "import/no-extraneous-dependencies": [
      "error",
      { devDependencies: ["**/*.test.ts", "**/test/**", "**/jest.config.js"] },
    ],
    "no-use-before-define": "off",
    "@typescript-eslint/no-use-before-define": ["error"],
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    // Handlers are class-property arrow functions so `this` binds when passed to a
    // router (conventions §12). A handler with no injected dependencies legitimately
    // never touches `this`; still enforced for ordinary methods.
    "class-methods-use-this": ["error", { enforceForClassFields: false }],
  },
  overrides: [
    {
      // A file of thin error subclasses is the point of utils/errors.ts — one class
      // per file would be five files of three lines each.
      files: ["src/utils/errors.ts"],
      rules: { "max-classes-per-file": "off" },
    },
  ],
};
