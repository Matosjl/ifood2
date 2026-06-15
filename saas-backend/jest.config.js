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
  testTimeout: 15000,
};
