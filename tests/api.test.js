const request = require('supertest');
const app = require('../server');

describe('Immudb Inventory Management API', () => {
  const API_KEY = 'supersecretapikey';
  const BASE_URL = '/api';
  let testSku;
  let createdProduct;

  beforeAll(() => {
    // Generate unique test SKU
    testSku = `TEST-${Date.now()}`;
  });

  describe('Health Check', () => {
    test('GET / should return health status', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.text).toContain('Immudb Inventory Management API is running!');
    });
  });

  describe('Product Management', () => {
    describe('POST /api/products', () => {
      test('should create a new product successfully', async () => {
        const productData = {
          sku: testSku,
          name: 'Test Gaming Laptop',
          description: 'High-performance laptop for testing',
          price: 2500.00,
          quantity: 5,
          category: 'Electronics',
          supplier: 'TestCorp'
        };

        const response = await request(app)
          .post(`${BASE_URL}/products`)
          .set('X-API-Key', API_KEY)
          .send(productData)
          .expect(200);

        expect(response.body).toHaveProperty('product');
        expect(response.body).toHaveProperty('immudb_tx_hash');
        expect(response.body).toHaveProperty('message');
        expect(response.body.product.sku).toBe(testSku);
        expect(response.body.product.name).toBe(productData.name);
        expect(response.body.product.price).toBe(productData.price);

        createdProduct = response.body.product;
      });

      test('should return 409 when creating duplicate product', async () => {
        const productData = {
          sku: testSku,
          name: 'Duplicate Product',
          description: 'This should fail',
          price: 100.00,
          quantity: 1,
          category: 'Test',
          supplier: 'TestCorp'
        };

        const response = await request(app)
          .post(`${BASE_URL}/products`)
          .set('X-API-Key', API_KEY)
          .send(productData)
          .expect(409);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('already exists');
      });

      test('should return 400 when missing required fields', async () => {
        const incompleteData = {
          sku: 'INCOMPLETE-001',
          name: 'Incomplete Product'
        };

        const response = await request(app)
          .post(`${BASE_URL}/products`)
          .set('X-API-Key', API_KEY)
          .send(incompleteData)
          .expect(400);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Missing required');
      });

      test('should return 401 when API key is missing', async () => {
        const productData = {
          sku: 'NO-AUTH-001',
          name: 'No Auth Product',
          price: 100.00,
          quantity: 1
        };

        const response = await request(app)
          .post(`${BASE_URL}/products`)
          .send(productData)
          .expect(401);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('API key');
      });

      test('should return 401 when API key is invalid', async () => {
        const productData = {
          sku: 'INVALID-AUTH-001',
          name: 'Invalid Auth Product',
          price: 100.00,
          quantity: 1
        };

        const response = await request(app)
          .post(`${BASE_URL}/products`)
          .set('X-API-Key', 'invalid-key')
          .send(productData)
          .expect(401);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('API key');
      });
    });

    describe('GET /api/products/:sku', () => {
      test('should get product details successfully', async () => {
        const response = await request(app)
          .get(`${BASE_URL}/products/${testSku}`)
          .set('X-API-Key', API_KEY)
          .expect(200);

        expect(response.body).toHaveProperty('sku', testSku);
        expect(response.body).toHaveProperty('name');
        expect(response.body).toHaveProperty('price');
        expect(response.body).toHaveProperty('current_stock');
        expect(response.body).toHaveProperty('immudb_verification_status', 'OK');
      });

      test('should return 404 for non-existent product', async () => {
        const response = await request(app)
          .get(`${BASE_URL}/products/NONEXISTENT-001`)
          .set('X-API-Key', API_KEY)
          .expect(404);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('not found');
      });

      test('should return 401 when API key is missing', async () => {
        const response = await request(app)
          .get(`${BASE_URL}/products/${testSku}`)
          .expect(401);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('API key');
      });
    });
  });

  describe('Time Travel Queries', () => {
    describe('GET /api/inventory/time-travel/:sku', () => {
      test('should get historical inventory state successfully', async () => {
        const timestamp = new Date().toISOString();
        
        const response = await request(app)
          .get(`${BASE_URL}/inventory/time-travel/${testSku}`)
          .set('X-API-Key', API_KEY)
          .query({ timestamp })
          .expect(200);

        expect(response.body).toHaveProperty('product');
        expect(response.body).toHaveProperty('historical_stock_at_timestamp');
        expect(response.body).toHaveProperty('target_timestamp', timestamp);
        expect(response.body).toHaveProperty('transactions_included');
        expect(response.body).toHaveProperty('immudb_verification_status', 'OK');
        expect(response.body.product.sku).toBe(testSku);
      });

      test('should return 400 when timestamp is missing', async () => {
        const response = await request(app)
          .get(`${BASE_URL}/inventory/time-travel/${testSku}`)
          .set('X-API-Key', API_KEY)
          .expect(400);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Timestamp parameter is required');
      });

      test('should return 400 when timestamp format is invalid', async () => {
        const response = await request(app)
          .get(`${BASE_URL}/inventory/time-travel/${testSku}`)
          .set('X-API-Key', API_KEY)
          .query({ timestamp: 'invalid-timestamp' })
          .expect(400);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Invalid timestamp format');
      });

      test('should return 404 for non-existent product', async () => {
        const timestamp = new Date().toISOString();
        
        const response = await request(app)
          .get(`${BASE_URL}/inventory/time-travel/NONEXISTENT-001`)
          .set('X-API-Key', API_KEY)
          .query({ timestamp })
          .expect(404);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('not found');
      });

      test('should return 401 when API key is missing', async () => {
        const timestamp = new Date().toISOString();
        
        const response = await request(app)
          .get(`${BASE_URL}/inventory/time-travel/${testSku}`)
          .query({ timestamp })
          .expect(401);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('API key');
      });
    });
  });

  describe('Audit Functions', () => {
    describe('GET /api/audit/verify/:transaction_id', () => {
      test('should verify transaction successfully', async () => {
        // First create a product to get a transaction ID
        const productData = {
          sku: `AUDIT-TEST-${Date.now()}`,
          name: 'Audit Test Product',
          price: 100.00,
          quantity: 1
        };

        const createResponse = await request(app)
          .post(`${BASE_URL}/products`)
          .set('X-API-Key', API_KEY)
          .send(productData)
          .expect(200);

        const transactionId = createResponse.body.immudb_tx_hash;

        const response = await request(app)
          .get(`${BASE_URL}/audit/verify/${transactionId}`)
          .set('X-API-Key', API_KEY)
          .expect(200);

        expect(response.body).toHaveProperty('transaction');
        expect(response.body).toHaveProperty('immudb_tx_id');
        expect(response.body).toHaveProperty('verification_status');
        expect(response.body.verification_status).toContain('Verified Successfully');
      });

      test('should return 404 for non-existent transaction', async () => {
        const response = await request(app)
          .get(`${BASE_URL}/audit/verify/nonexistent-transaction-id`)
          .set('X-API-Key', API_KEY)
          .expect(404);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('not found');
      });

      test('should return 401 when API key is missing', async () => {
        const response = await request(app)
          .get(`${BASE_URL}/audit/verify/some-transaction-id`)
          .expect(401);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('API key');
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post(`${BASE_URL}/products`)
        .set('X-API-Key', API_KEY)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });

    test('should handle invalid routes', async () => {
      const response = await request(app)
        .get('/api/invalid-route')
        .set('X-API-Key', API_KEY)
        .expect(404);
    });
  });

  describe('Performance Tests', () => {
    test('should respond within reasonable time', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
    });

    test('should handle concurrent requests', async () => {
      const promises = Array(10).fill().map(() => 
        request(app)
          .get('/')
          .expect(200)
      );

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(10);
    });
  });
});
