import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    // Build output, generated SQL, and the CLI's assembled template output.
    // cli/template/** is generated verbatim from this repo's own src/ by
    // cli/scripts/build-template.ts (running it would double every finding),
    // and cli/dist/** and cli/node_modules/** are build output / dependencies.
    // cli/src/** and cli/scripts/** are original, published CLI code and are
    // linted like everything else.
    ignores: [
      ".next/**",
      "node_modules/**",
      "cli/template/**",
      "cli/dist/**",
      "cli/node_modules/**",
      "drizzle/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Deliberate: this codebase already uses a leading underscore to mark an
      // intentionally-unused parameter/variable (e.g. a fake's ignored arg, a
      // destructured field kept only for documentation). next/typescript's
      // no-unused-vars doesn't recognize that convention by default, so this
      // reconfigures (not disables) the rule to honor it — it still flags any
      // genuinely-unused, non-underscored binding.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
