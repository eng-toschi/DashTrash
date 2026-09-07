import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['node_modules', 'coverage', 'dist', '.expo', '.expo-export', 'design'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['babel.config.js', 'metro.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Regras do spec §3: dinheiro nunca vira float, nada de any, nada de `!`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Dinheiro é inteiro. Use domain/money.ts (spec §6).' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Number', property: 'parseFloat', message: 'Dinheiro é inteiro (spec §6).' },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // babel.config.js e metro.config.js são CommonJS exigidos pelo Metro;
    // as regras de módulo ESM não se aplicam a eles.
    files: ['babel.config.js', 'metro.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off', 'no-undef': 'off' },
  },
);
