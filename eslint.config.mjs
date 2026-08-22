// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Cấu hình ESLint dùng chung cho mọi package trong monorepo.
 * Mỗi package re-export config này và bổ sung `tsconfigRootDir` của riêng nó.
 */
export default tseslint.config(
  { ignores: ['eslint.config.mjs', 'dist/**', 'node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      sourceType: 'commonjs',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',
    },
  },
);
