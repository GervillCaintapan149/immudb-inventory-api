# 🧪 Immudb Inventory API - Testing Guide

This guide covers comprehensive testing for the Immudb Inventory Management API, including Postman collections, automated tests, and testing strategies.

## 📋 Table of Contents

- [Postman Collection](#postman-collection)
- [Automated Tests](#automated-tests)
- [Test Scenarios](#test-scenarios)
- [Running Tests](#running-tests)
- [Test Coverage](#test-coverage)
- [CI/CD Integration](#cicd-integration)

## 🚀 Postman Collection

### Import Collection

1. **Download Files:**
   - `Immudb-Inventory-API.postman_collection.json`
   - `Immudb-Inventory-Environment.postman_environment.json`

2. **Import to Postman:**
   - Open Postman
   - Click "Import" → "Upload Files"
   - Select both JSON files
   - Click "Import"

3. **Set Environment:**
   - Select "Immudb Inventory Environment" from dropdown
   - Verify variables are set correctly

### Collection Structure

```
📁 Immudb Inventory API
├── 📁 Health Check
│   └── GET / (Health Check)
├── 📁 Products
│   ├── POST /api/products (Create Product - Success)
│   ├── POST /api/products (Create Product - Duplicate Error)
│   ├── POST /api/products (Create Product - Missing Fields)
│   ├── GET /api/products/:sku (Get Product - Success)
│   └── GET /api/products/:sku (Get Product - Not Found)
├── 📁 Inventory
│   ├── GET /api/inventory/time-travel/:sku (Time Travel - Success)
│   ├── GET /api/inventory/time-travel/:sku (Time Travel - Missing Timestamp)
│   ├── GET /api/inventory/time-travel/:sku (Time Travel - Invalid Timestamp)
│   └── GET /api/inventory/time-travel/:sku (Time Travel - Product Not Found)
├── 📁 Audit
│   ├── GET /api/audit/verify/:transaction_id (Verify Transaction - Success)
│   └── GET /api/audit/verify/:transaction_id (Verify Transaction - Not Found)
└── 📁 Authentication
    ├── Missing API Key
    └── Invalid API Key
```

### Test Features

- ✅ **Automated Assertions** - Each request has comprehensive test scripts
- ✅ **Dynamic Variables** - Auto-generates unique test data
- ✅ **Environment Management** - Easy switching between environments
- ✅ **Pre-request Scripts** - Sets up test data automatically
- ✅ **Collection Runner** - Run entire test suite with one click

## 🤖 Automated Tests

### Test Framework

- **Jest** - JavaScript testing framework
- **Supertest** - HTTP assertion library
- **Coverage Reports** - Code coverage analysis

### Test Structure

```
tests/
├── setup.js              # Global test setup
├── api.test.js           # Main API tests
└── (future test files)
```

### Test Categories

1. **Health Check Tests**
   - Server availability
   - Response time validation

2. **Product Management Tests**
   - Create product (success/error cases)
   - Get product (success/error cases)
   - Validation and error handling

3. **Time Travel Tests**
   - Historical inventory queries
   - Timestamp validation
   - Edge cases

4. **Audit Tests**
   - Transaction verification
   - Immudb integrity checks

5. **Authentication Tests**
   - API key validation
   - Authorization errors

6. **Performance Tests**
   - Response time limits
   - Concurrent request handling

## 🎯 Test Scenarios

### Happy Path Scenarios

1. **Complete Product Lifecycle**
   ```bash
   # 1. Create product
   POST /api/products
   # 2. Get product details
   GET /api/products/:sku
   # 3. Query historical state
   GET /api/inventory/time-travel/:sku?timestamp=...
   # 4. Verify transaction
   GET /api/audit/verify/:transaction_id
   ```

2. **Time Travel Workflow**
   ```bash
   # 1. Create product with initial stock
   POST /api/products {"quantity": 100}
   # 2. Query state at creation time
   GET /api/inventory/time-travel/:sku?timestamp=creation_time
   # 3. Query state after creation
   GET /api/inventory/time-travel/:sku?timestamp=after_creation
   ```

### Error Scenarios

1. **Validation Errors**
   - Missing required fields
   - Invalid data types
   - Malformed JSON

2. **Business Logic Errors**
   - Duplicate product creation
   - Non-existent product queries
   - Invalid timestamps

3. **Authentication Errors**
   - Missing API key
   - Invalid API key
   - Unauthorized access

4. **System Errors**
   - Database connection issues
   - Server unavailability
   - Timeout scenarios

## 🏃‍♂️ Running Tests

### Quick Start

```bash
# Run all tests (auto-starts server)
./run-tests.sh

# Run specific test type
./run-tests.sh api
./run-tests.sh coverage
./run-tests.sh watch
```

### Manual Testing

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run API tests only
npm run test:api

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Docker Testing

```bash
# Start services
docker-compose up -d

# Run tests against Docker services
npm test

# Stop services
docker-compose down
```

### Postman Collection Runner

1. **Open Collection Runner**
   - Click "Collections" → "Immudb Inventory API"
   - Click "Run" button

2. **Configure Run**
   - Select all requests
   - Set iterations (1 for single run)
   - Set delay (0ms for speed)

3. **Run Tests**
   - Click "Run Immudb Inventory API"
   - Monitor test results
   - Review failed tests

## 📊 Test Coverage

### Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# View HTML report
open coverage/lcov-report/index.html
```

### Coverage Targets

- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

### Coverage Areas

- ✅ **API Endpoints** - All routes tested
- ✅ **Error Handling** - All error cases covered
- ✅ **Authentication** - Security scenarios tested
- ✅ **Business Logic** - Core functionality validated
- ⚠️ **Edge Cases** - Some complex scenarios need more coverage

## 🔄 CI/CD Integration

### GitHub Actions

Create `.github/workflows/test.yml`:

```yaml
name: API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      immudb:
        image: codenotary/immudb:latest
        ports:
          - 3322:3322
          - 8080:8080
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm install
        
      - name: Run tests
        run: npm test
        env:
          IMMUDB_HOST: localhost
          IMMUDB_PORT: 3322
          
      - name: Upload coverage
        uses: codecov/codecov-action@v1
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any
    
    stages {
        stage('Test') {
            steps {
                sh 'npm install'
                sh 'npm test'
            }
        }
        
        stage('Coverage') {
            steps {
                sh 'npm run test:coverage'
                publishHTML([
                    allowMissing: false,
                    alwaysLinkToLastBuild: true,
                    keepAll: true,
                    reportDir: 'coverage',
                    reportFiles: 'lcov-report/index.html',
                    reportName: 'Coverage Report'
                ])
            }
        }
    }
}
```

## 🐛 Debugging Tests

### Common Issues

1. **Server Not Running**
   ```bash
   # Check if server is running
   curl http://localhost:3000/
   
   # Start server manually
   node server.js
   ```

2. **Database Connection Issues**
   ```bash
   # Check Immudb status
   curl http://localhost:8080/healthz
   
   # Start Immudb
   docker run -d -p 3322:3322 -p 8080:8080 codenotary/immudb:latest
   ```

3. **Test Timeouts**
   ```bash
   # Increase timeout in jest.config.js
   testTimeout: 60000
   ```

### Debug Mode

```bash
# Run tests with debug output
DEBUG=* npm test

# Run specific test with debug
npm test -- --testNamePattern="Create Product"
```

## 📈 Performance Testing

### Load Testing with Artillery

```bash
# Install Artillery
npm install -g artillery

# Run load test
artillery run load-test.yml
```

### Load Test Configuration

```yaml
# load-test.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "API Load Test"
    requests:
      - get:
          url: "/"
      - post:
          url: "/api/products"
          headers:
            X-API-Key: "supersecretapikey"
          json:
            sku: "LOAD-{{ $randomString() }}"
            name: "Load Test Product"
            price: 100
            quantity: 1
```

## 🎯 Best Practices

### Test Organization

1. **Arrange-Act-Assert** pattern
2. **Descriptive test names**
3. **Independent tests** (no dependencies)
4. **Clean setup/teardown**

### Test Data Management

1. **Unique test data** per test
2. **Cleanup after tests**
3. **Realistic test scenarios**
4. **Edge case coverage**

### Error Testing

1. **Test all error codes**
2. **Validate error messages**
3. **Test error handling paths**
4. **Verify error responses**

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Postman Testing](https://learning.postman.com/docs/writing-scripts/test-scripts/)
- [API Testing Best Practices](https://blog.postman.com/api-testing-best-practices/)

---


