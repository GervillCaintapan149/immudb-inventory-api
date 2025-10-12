// Test setup file
const { exec } = require('child_process');

// Global test setup
beforeAll(async () => {
  console.log('🧪 Starting API tests...');
  console.log('📋 Test environment setup complete');
});

afterAll(async () => {
  console.log('✅ API tests completed');
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Increase timeout for slow operations
jest.setTimeout(30000);
