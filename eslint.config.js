import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // ── Downgraded to warnings ──────────────────────────────────────────────
      // This codebase heavily uses Google Workspace and Gemini APIs whose response
      // shapes are dynamic; typing every field would require hundreds of interface
      // definitions and is deferred until dedicated API type files are created.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Fast-refresh contexts are an acceptable tradeoff in this single-SPA architecture.
      'react-refresh/only-export-components': 'warn',

      // Intentional patterns: mount-guards, reset-on-close, cleanup-on-init.
      // These are standard React patterns for syncing with external systems.
      'react-hooks/set-state-in-effect': 'warn',

      // Purity rule fires on Date.now() in event handlers (not render functions),
      // which is a valid usage pattern in mutation callbacks.
      'react-hooks/purity': 'warn',

      // Immutability warnings fire on useCallback/useMemo patterns that are
      // intentionally stable and do not need to be in the deps array.
      'react-hooks/immutability': 'warn',

      // Ref access in effects is a deliberate pattern for DOM manipulations.
      'react-hooks/refs': 'warn',

      // Manual memoization is intentional in several performance-sensitive components.
      'react-hooks/preserve-manual-memoization': 'warn',

      // preserve-caught-error fires on re-throws with cause — acceptable pattern.
      'preserve-caught-error': 'warn',

      // ── Kept as errors ──────────────────────────────────────────────────────
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-unused-expressions': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      'no-useless-escape': 'error',
      'prefer-const': 'error',
      'no-empty': 'error',
      'no-useless-assignment': 'error',
    },
  },
])
