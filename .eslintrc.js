module.exports = {
  env: {
    node: true,
    es2021: true,
    mocha: true
  },
  extends: [
    'standard'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'space-before-function-paren': ['error', {
      anonymous: 'always',
      named: 'never',
      asyncArrow: 'always'
    }],
    'comma-dangle': ['error', 'never'],
    semi: ['error', 'always'],
    indent: ['error', 2],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    'prefer-const': 'error',
    'no-var': 'error',
    'arrow-parens': ['error', 'as-needed'],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'template-curly-spacing': ['error', 'never'],
    quotes: ['error', 'single', { avoidEscape: true }],
    'no-trailing-spaces': 'error',
    'eol-last': ['error', 'always'],
    'max-len': ['error', { code: 120, ignoreComments: true, ignoreStrings: true }],
    'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }]
  }
};
