module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./tests/setup-env.js'],
  setupFilesAfterEnv: ['./tests/setup-global.js'],
  testMatch: ['**/tests/**/*.test.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/modules/**/*.js',
    '!src/**/*.test.js',
  ],
  coverageThreshold: {
    global: { statements: 26, branches: 4, lines: 29, functions: 3 }
  },
  testTimeout: 15000,
};
