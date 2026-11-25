import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const layerRule = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

const forbidden = (layers, from) =>
  layers.map((layer) => ({
    group: [`**/${layer}`, `**/${layer}/**`],
    message: `La capa ${from} no puede importar de ${layer}.`,
  }));

const noSystemClock = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'No uses new Date(): inyecta el Clock (src/infrastructure/clock).',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'No uses Date.now(): inyecta el Clock (src/infrastructure/clock).',
  },
];

export default tseslint.config(
  { ignores: ['provider/**', 'dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      complexity: ['error', 10],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-syntax': ['error', ...noSystemClock],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: layerRule(forbidden(['application', 'infrastructure', 'http'], 'domain')),
  },
  {
    files: ['src/application/**/*.ts'],
    rules: layerRule(forbidden(['infrastructure', 'http'], 'application')),
  },
  {
    files: ['src/infrastructure/clock/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
