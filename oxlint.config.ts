import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, react, tanstack, vitest],
  ignorePatterns: core.ignorePatterns,
  // Relaxed rules: pure-style / high-noise nitpicks and rules that clash with
  // established repo conventions. Correctness-oriented rules stay on.
  rules: {
    // Style preferences we don't enforce.
    "sort-keys": "off",
    "func-style": "off",
    curly: "off",
    "prefer-destructuring": "off",
    "arrow-body-style": "off",
    "no-plusplus": "off",
    "no-nested-ternary": "off",
    "unicorn/no-nested-ternary": "off",
    "no-inline-comments": "off",
    "require-unicode-regexp": "off",
    "prefer-named-capture-group": "off",
    "promise/prefer-await-to-then": "off",
    "unicorn/prefer-ternary": "off",
    "unicorn/prefer-number-coercion": "off",
    "unicorn/prefer-string-replace-all": "off",
    "unicorn/prefer-response-static-json": "off",
    "unicorn/prefer-export-from": "off",
    "unicorn/prefer-at": "off",
    "unicorn/prefer-spread": "off",
    "unicorn/prefer-logical-operator-over-ternary": "off",
    "unicorn/prefer-math-trunc": "off",
    "unicorn/numeric-separators-style": "off",
    "unicorn/filename-case": "off",
    "unicorn/consistent-function-scoping": "off",
    "unicorn/no-array-for-each": "off",
    "unicorn/no-array-sort": "off",
    "unicorn/no-array-reverse": "off",
    "unicorn/no-array-reduce": "off",
    "unicorn/no-negated-condition": "off",
    "unicorn/no-useless-undefined": "off",
    "unicorn/no-useless-collection-argument": "off",
    "unicorn/no-await-expression-member": "off",
    "unicorn/catch-error-name": "off",
    "unicorn/require-post-message-target-origin": "off",
    "object-shorthand": "off",
    "no-negated-condition": "off",
    "no-empty": "off",
    "no-empty-function": "off",
    "no-promise-executor-return": "off",
    "no-unused-expressions": "off",
    "typescript/method-signature-style": "off",
    "react/no-unescaped-entities": "off",
    "react/button-has-type": "off",
    "react/jsx-no-useless-fragment": "off",
    "react/no-object-type-as-default-prop": "off",
    "react/hook-use-state": "off",
    "react/jsx-no-constructed-context-values": "off",
    "react/no-danger": "off",
    // False positive: live-state `storage.find(schema, query)` looks like
    // Array#find(predicate, thisArg) to unicorn.
    "unicorn/no-array-method-this-argument": "off",
    // Needs dedicated React Compiler migration; clashes with live-state hooks
    // and intentional effect patterns today.
    "react/react-compiler": "off",
    // Complexity/cognitive metrics — not actionable as drive-by lint fixes.
    complexity: "off",
    "max-classes-per-file": "off",
    // Import order fights side-effect + type import layout we use.
    "import/first": "off",
    // Promise style — Node/library callbacks and deferred constructors are common.
    "promise/avoid-new": "off",
    "promise/prefer-await-to-callbacks": "off",
    "node/callback-return": "off",
    // Nullish `== null` is intentional across the codebase.
    "no-eq-null": "off",
    // Frequently intentional in this codebase; too noisy to enforce.
    "no-use-before-define": "off",
    "require-await": "off",
    "no-await-in-loop": "off",
    // Clashes with our "leave a TODO" convention.
    "no-warning-comments": "off",
  },
});
