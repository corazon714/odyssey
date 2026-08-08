/**
 * apps/mobile is the only package on Jest. The pure-TypeScript packages run on Vitest;
 * React Native needs jest-expo's transform and module mocks, which is what the Expo SDK
 * supports. `pnpm test` runs both.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/ios/', '/android/'],
  collectCoverageFrom: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
};
