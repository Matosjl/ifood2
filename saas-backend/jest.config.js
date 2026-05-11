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
    global: { statements: 70, branches: 60, functions: 70, lines: 70 }
  },
  testTimeout: 15000,
};
