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
  },
};
