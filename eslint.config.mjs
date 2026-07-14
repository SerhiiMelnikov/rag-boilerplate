import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    // Build output, generated SQL, and the assembled CLI template (a verbatim
    // copy of this repo — linting it would double every finding).
    ignores: [".next/**", "node_modules/**", "cli/**", "drizzle/**", "next-env.d.ts"],
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
