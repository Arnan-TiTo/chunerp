/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-refresh'],
  ignorePatterns: ['dist', 'node_modules', '*.cjs', 'vite.config.ts'],
  settings: { react: { version: 'detect' } },
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
    'no-irregular-whitespace': ['error', { skipTemplates: true }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  overrides: [
    {
      // Context providers deliberately export their own hook alongside the
      // component; the rule only affects HMR ergonomics, not correctness.
      files: [
        'src/**/*Provider.tsx',
        'src/hooks/**',
        'src/components/form/Field.tsx',
        'src/components/data-display/KpiCard.tsx',
        'src/components/feedback/Toast.tsx',
        'src/features/dashboard/panels.tsx',
      ],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**'],
      env: { node: true },
      rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
    },
  ],
}
