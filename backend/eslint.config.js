import globals from "globals";
import pluginSecurity from "eslint-plugin-security";
import eslintConfigPrettier from "eslint-config-prettier";

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.env*",
      "**/logs/**",
      "**/public/**",
      "**/uploads/**",
    ],
  },

  // Base configuration for all JavaScript files
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      security: pluginSecurity,
    },
    rules: {
      // ===========================
      // SECURITY RULES
      // ===========================
      ...pluginSecurity.configs.recommended.rules,

      // Detect potential security vulnerabilities
      "security/detect-object-injection": "off", // Too many false positives with dynamic objects
      "security/detect-non-literal-regexp": "warn",
      "security/detect-unsafe-regex": "error",
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "warn",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-non-literal-fs-filename": "off", // Expected with path.resolve() and env vars
      "security/detect-non-literal-require": "warn",
      "security/detect-possible-timing-attacks": "off", // Handled by manual timing attack prevention
      "security/detect-pseudoRandomBytes": "error",

      // ===========================
      // ERROR PREVENTION
      // ===========================
      "no-console": process.env.NODE_ENV === "production" ? "error" : "off",
      "no-debugger": process.env.NODE_ENV === "production" ? "error" : "warn",
      "no-alert": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",

      // Prevent common mistakes
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-undef": "error",
      "no-unreachable": "error",
      "no-constant-condition": "warn",
      "no-duplicate-imports": "error",

      // ===========================
      // BEST PRACTICES
      // ===========================
      eqeqeq: ["error", "always"], // Require === and !==
      "no-var": "error", // Use const/let
      "prefer-const": "error",
      "prefer-arrow-callback": "warn",
      "no-param-reassign": "warn",
      "no-return-await": "error",
      "require-await": "warn",

      // Async/Promise handling
      "no-async-promise-executor": "error",
      "no-await-in-loop": "off", // Sometimes necessary in sequential operations
      "prefer-promise-reject-errors": "error",

      // ===========================
      // CODE QUALITY
      // ===========================
      complexity: ["warn", { max: 25 }], // Cyclomatic complexity - increased for flexibility
      "max-depth": ["warn", { max: 5 }], // Nested blocks
      "max-nested-callbacks": ["warn", { max: 5 }],
      "max-params": ["warn", { max: 6 }],
      "max-lines-per-function": [
        "warn",
        {
          max: 200,
          skipBlankLines: true,
          skipComments: true,
        },
      ],

      // ===========================
      // DATABASE & SQL INJECTION
      // ===========================
      "no-template-curly-in-string": "error", // Prevent accidental SQL injection

      // ===========================
      // IMPORTS & MODULES
      // ===========================
      "no-duplicate-imports": "error",
      "sort-imports": [
        "warn",
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
        },
      ],
    },
  },

  // Configuration for test files (if you have tests)
  {
    files: ["**/*.test.js", "**/*.spec.js", "**/tests/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.mocha,
      },
    },
    rules: {
      "no-console": "off",
      "max-lines-per-function": "off",
      "security/detect-non-literal-fs-filename": "off",
    },
  },

  // Configuration for config files
  {
    files: ["**/config/**/*.js", "**/*.config.js"],
    rules: {
      "no-console": "off",
    },
  },

  // Custom rules for controllers
  {
    files: ["**/controllers/**/*.js"],
    rules: {
      "max-lines-per-function": [
        "warn",
        {
          max: 200, // Controllers can be longer
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },

  // Custom rules for middleware
  {
    files: ["**/middlewares/**/*.js", "**/middleware/**/*.js"],
    rules: {
      "require-await": "off", // Middlewares often have sync handlers
    },
  },

  // Prettier integration - must be last to override other formatting rules
  eslintConfigPrettier,
];
