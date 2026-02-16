import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "_bmad/**",
    "_bmad-output/**",
    "docs/**",
    "e2e/**",
  ]),
  {
    rules: {
      // Import order: external -> @/ aliases -> relative
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          pathGroups: [
            {
              pattern: "@/**",
              group: "internal",
              position: "before",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      // No default exports (except Next.js pages/layouts)
      "no-restricted-exports": [
        "error",
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
      // No console.log (warn in dev, error in CI)
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // No any type
      "@typescript-eslint/no-explicit-any": "error",
      // Allow underscore-prefixed unused vars (placeholder stubs)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Prefer const
      "prefer-const": "error",
    },
  },
  // Allow default exports for Next.js convention files
  {
    files: [
      "src/app/**/page.tsx",
      "src/app/**/layout.tsx",
      "src/app/**/error.tsx",
      "src/app/**/loading.tsx",
      "src/app/**/not-found.tsx",
      "src/app/**/default.tsx",
      "src/proxy.ts",
      "next.config.ts",
      "postcss.config.mjs",
      "eslint.config.mjs",
      "vitest.config.ts",
      "drizzle.config.ts",
      "playwright.config.ts",
    ],
    rules: {
      "no-restricted-exports": "off",
    },
  },
]);

export default eslintConfig;
