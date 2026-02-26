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
    "scripts/**",
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

      // ============================================================
      // ANTI-PATTERN ENFORCEMENT — automated bug prevention
      // ============================================================

      // Ban process.env direct access — use @/lib/env instead
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            "Direct process.env access is forbidden. Use `import { env } from '@/lib/env'` instead. See CLAUDE.md anti-patterns.",
        },
        {
          selector: "TSEnumDeclaration",
          message:
            "TypeScript enums are forbidden. Use `as const` objects or union types instead. See CLAUDE.md anti-patterns.",
        },
      ],
      // Ban snapshot tests — use explicit assertions
      "no-restricted-properties": [
        "error",
        {
          object: "expect",
          property: "toMatchSnapshot",
          message:
            "Snapshot tests are forbidden. Write explicit assertions instead. See CLAUDE.md anti-patterns.",
        },
        {
          object: "expect",
          property: "toMatchInlineSnapshot",
          message:
            "Snapshot tests are forbidden. Write explicit assertions instead. See CLAUDE.md anti-patterns.",
        },
      ],
      // Ban direct Supabase client creation — use factory functions
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              importNames: ["createClient"],
              message:
                "Direct createClient() is forbidden. Use createServerClient/createBrowserClient/createAdminClient from @/lib/supabase/ instead.",
            },
          ],
        },
      ],
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
  // Allow process.env in infra files that bootstrap before env.ts
  {
    files: [
      "src/lib/env.ts",
      "src/lib/supabase/client.ts",
      "src/lib/supabase/server.ts",
      "src/lib/supabase/admin.ts",
      "src/lib/logger.ts",
      "src/db/client.ts",
      "src/db/__tests__/**",
      "src/db/seeds/**",
      "src/__tests__/integration/**",
      "src/proxy.ts",
      "next.config.ts",
      "drizzle.config.ts",
      "vitest.config.ts",
      "playwright.config.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        // Keep enum ban, but remove process.env ban for these files
        {
          selector: "TSEnumDeclaration",
          message:
            "TypeScript enums are forbidden. Use `as const` objects or union types instead.",
        },
      ],
    },
  },
  // Allow console.log in seed/migration scripts (CLI output)
  {
    files: ["src/db/seeds/**"],
    rules: {
      "no-console": "off",
    },
  },
  // Allow direct createClient in Supabase factory files & RLS tests
  {
    files: [
      "src/lib/supabase/client.ts",
      "src/lib/supabase/server.ts",
      "src/lib/supabase/admin.ts",
      "src/db/__tests__/**",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  // Ban "use client" on Next.js page files (must include ALL global bans — flat config is last-match-wins)
  {
    files: ["src/app/**/page.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            "Direct process.env access is forbidden. Use `import { env } from '@/lib/env'` instead. See CLAUDE.md anti-patterns.",
        },
        {
          selector: "TSEnumDeclaration",
          message:
            "TypeScript enums are forbidden. Use `as const` objects or union types instead.",
        },
        {
          selector:
            "ExpressionStatement > Literal[value='use client']",
          message:
            "\"use client\" is forbidden on page.tsx files. Move client logic to a feature boundary component. See CLAUDE.md RSC boundary pattern.",
        },
      ],
    },
  },
]);

export default eslintConfig;
