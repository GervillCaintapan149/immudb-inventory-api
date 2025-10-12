# Immudb Inventory Management API

A immutable inventory management system built with Node.js, Express, and Immudb. 




## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Docker (for Immudb)
- npm or yarn

###  Setup
```bash
# Clone and setup
git clone <repository-url>
cd immudb-shopInventory
npm install

# Start Immudb
docker run -d --name immudb -p 3322:3322 -p 8080:8080 codenotary/immudb:latest

# Start API
npm start

# Test the API
curl http://localhost:3000/
```

## Setup Instructions

### Option 1: Local Development

#### 1. Install Dependencies
```bash
# Install Node.js dependencies
npm install

# Install test dependencies (optional)
npm install --save-dev jest supertest nodemon
```

#### 2. Start Immudb Database
```bash
# Using Docker (Recommended)
docker run -d --name immudb \
  -p 3322:3322 \
  -p 8080:8080 \
  codenotary/immudb:latest

# Verify Immudb is running
curl http://localhost:8080/healthz
```

#### 3. Configure Environment
```bash
# Create .env file
cat > .env << EOF
API_KEY=supersecretapikey
NODE_ENV=development
PORT=3000
IMMUDB_HOST=127.0.0.1
IMMUDB_PORT=3322
IMMUDB_USER=immudb
IMMUDB_PASSWORD=immudb
EOF
```

#### 4. Start the API
```bash
# Development mode
npm run dev



### Option 2: Docker Compose

#### 1. Start All Services
```bash
# Start everything
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

#### 2. Stop Services
```bash
# Stop services
docker-compose down

# Stop and remove data
docker-compose down -v
```


#### 2. Environment Configuration
```bash
# Set production environment variables
export API_KEY=your-secure-production-key
export NODE_ENV=production
export IMMUDB_HOST=immudb
export IMMUDB_PORT=3322
```

## 📚 API Documentation

### Base URL
```
http://localhost:3000
```

### Authentication
All API endpoints require an API key in the header:
```
X-API-Key: supersecretapikey
```

### Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/api/products` | Create product |
| `GET` | `/api/products/:sku` | Get product details |
| `GET` | `/api/inventory/time-travel/:sku` | Time travel query |
| `GET` | `/api/audit/verify/:transaction_id` | Verify transaction |

### 1. Health Check

**GET** `/`

Check if the API is running.

**Response:**
```json
"Immudb Inventory Management API is running!"
```

**Example:**
```bash
curl http://localhost:3000/
```

### 2. Create Product

**POST** `/api/products`

Create a new product with initial stock.

**Headers:**
```
Content-Type: application/json
X-API-Key: supersecretapikey
```

**Request Body:**
```json
{
  "sku": "LAPTOP-001",
  "name": "Gaming Laptop",
  "description": "High-performance gaming laptop",
  "price": 2500.00,
  "quantity": 10,
  "category": "Electronics",
  "supplier": "TechCorp"
}
```

**Response (201):**
```json
{
  "product": {
    "sku": "LAPTOP-001",
    "name": "Gaming Laptop",
    "description": "High-performance gaming laptop",
    "price": 2500.00,
    "initial_quantity": 10,
    "category": "Electronics",
    "supplier": "TechCorp",
    "created_at": "2025-10-12T14:30:00.000Z"
  },
  "immudb_tx_hash": "abc123...",
  "message": "Product added and initial stock recorded successfully."
}
```

**Error Responses:**
- `400` - Missing required fields
- `409` - Product already exists
- `401` - Invalid API key

### 3. Get Product Details

**GET** `/api/products/:sku`

Get current product details with stock level.

**Headers:**
```
X-API-Key: supersecretapikey
```

**Response (200):**
```json
{
  "sku": "LAPTOP-001",
  "name": "Gaming Laptop",
  "description": "High-performance gaming laptop",
  "price": 2500.00,
  "category": "Electronics",
  "supplier": "TechCorp",
  "created_at": "2025-10-12T14:30:00.000Z",
  "current_stock": 10,
  "last_transaction_timestamp": "2025-10-12T14:30:00.000Z",
  "immudb_verification_status": "OK"
}
```

**Error Responses:**
- `404` - Product not found
- `401` - Invalid API key

### 4. Time Travel Query ⏰

**GET** `/api/inventory/time-travel/:sku?timestamp=YYYY-MM-DDTHH:mm:ss.sssZ`

Get inventory state at a specific point in time.

**Headers:**
```
X-API-Key: supersecretapikey
```

**Query Parameters:**
- `timestamp` (required) - ISO 8601 timestamp

**Response (200):**
```json
{
  "product": {
    "sku": "LAPTOP-001",
    "name": "Gaming Laptop",
    "description": "High-performance gaming laptop",
    "price": 2500.00,
    "category": "Electronics",
    "supplier": "TechCorp",
    "created_at": "2025-10-12T14:30:00.000Z"
  },
  "historical_stock_at_timestamp": 10,
  "target_timestamp": "2025-10-12T15:00:00.000Z",
  "last_transaction_before_timestamp": "2025-10-12T14:30:00.000Z",
  "transactions_included": 1,
  "immudb_verification_status": "OK",
  "message": "Inventory state for SKU 'LAPTOP-001' at 2025-10-12T15:00:00.000Z"
}
```

**Error Responses:**
- `400` - Missing or invalid timestamp
- `404` - Product not found
- `401` - Invalid API key

**Example:**
```bash
curl -X GET "http://localhost:3000/api/inventory/time-travel/LAPTOP-001?timestamp=2025-10-12T15:00:00.000Z" \
  -H "X-API-Key: supersecretapikey"
```

### 5. Verify Transaction

**GET** `/api/audit/verify/:transaction_id`

Verify a specific transaction's integrity.

**Headers:**
```
X-API-Key: supersecretapikey
```

**Response (200):**
```json
{
  "transaction": {
    "transaction_id": "abc123...",
    "sku": "LAPTOP-001",
    "type": "IN",
    "quantity_change": 10,
    "reason": "Initial Stock",
    "performed_by": "API Key User",
    "timestamp": "2025-10-12T14:30:00.000Z"
  },
  "immudb_tx_id": "def456...",
  "revision": 1,
  "verification_status": "Verified Successfully by Immudb",
  "message": "Immudb automatically verifies data integrity on read operations from collections. The \"OK\" status confirms cryptographic proof."
}
```

**Error Responses:**
- `404` - Transaction not found
- `401` - Invalid API key

## 🏗️ Design Decisions

### 1. Immutable Database Choice: Immudb

**Decision:** Use Immudb instead of traditional SQL/NoSQL databases.


**Implementation:**
```javascript
// Product storage
key: "product:LAPTOP-001"
value: { sku, name, price, ... }

// Transaction storage  
key: "transaction:uuid-123"
value: { transaction_id, sku, type, quantity_change, ... }
```

### 3. Time Travel Implementation

**Decision:** Implement time travel by scanning all transactions and filtering by timestamp.


### 4. API Design: RESTful with Immutable Focus

**Decision:** Design RESTful API with immutable-first patterns.


**Key patterns:**
- No UPDATE/DELETE operations - only CREATE and READ
- All changes create new transaction records
- Time travel queries for historical data
- Transaction verification for audit trails

### 5. Authentication: API Key Based

**Decision:** Use simple API key authentication instead of OAuth/JWT.


### 6. Error Handling Strategy

**Decision:** Comprehensive error handling with detailed error messages.

**Rationale:**
- **Debugging** - Detailed errors help with development
- **User experience** - Clear error messages for API consumers

**Error categories:**
- **Validation errors** (400) - Invalid input data
- **Authentication errors** (401) - Missing/invalid API key
- **Not found errors** (404) - Resource doesn't exist
- **Conflict errors** (409) - Business logic violations
- **Server errors** (500) - Internal system errors

### 7. Testing Strategy

**Decision:** Comprehensive testing with both automated and manual testing.

**Rationale:**
- **Quality assurance** - Catch bugs before production
- **Documentation** - Tests serve as living documentation
- **Confidence** - Safe to make changes with test coverage
- **Compliance** - Critical for immutable/audit systems

**Testing layers:**
- **Unit tests** - Individual function testing
- **Integration tests** - API endpoint testing
- **End-to-end tests** - Complete workflow testing
- **Manual tests** - Postman collection for interactive testing

##  Architecture

### System Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App    │    │   Postman/      │    │   Test Suite    │
│   (Frontend)    │    │   API Client    │    │   (Jest)        │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │     Express.js API        │
                    │   (Node.js Server)        │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │    Immudb Database        │
                    │   (Immutable Storage)     │
                    └───────────────────────────┘
```

### Data Flow

1. **Product Creation:**
   ```
   Client → API → Immudb (Product + Initial Transaction)
   ```

2. **Product Retrieval:**
   ```
   Client → API → Immudb (Product + Stock Calculation)
   ```

3. **Time Travel Query:**
   ```
   Client → API → Immudb (Scan Transactions) → Calculate Historical Stock
   ```

4. **Transaction Verification:**
   ```
   Client → API → Immudb (Verify Transaction) → Return Proof
   ```

### Key Components

#### 1. **API Layer** (`server.js`)
- Express.js REST API
- Request validation
- Authentication middleware
- Error handling
- Route definitions

#### 2. **Business Logic** (`src/routes/`)
- Product management
- Inventory calculations
- Time travel queries
- Transaction processing

#### 3. **Data Layer** (`src/immudb-client.js`)
- Immudb connection management
- Data serialization/deserialization
- Transaction handling
- Error management

#### 4. **Middleware** (`src/middleware/`)
- API key authentication
- Request validation
- Error handling

## 🧪 Testing

### Test Coverage
- **API Endpoints** - All routes tested
- **Error Scenarios** - Comprehensive error testing
- **Time Travel** - Historical query validation
- **Authentication** - Security testing
- **Performance** - Load and response time testing

### Running Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run specific test file
npm test tests/api.test.js
```

### Postman Collection
Import `Immudb-Inventory-API.postman_collection.json` for interactive testing.

## 🚀 Deployment

### Docker Deployment
```bash
# Development
docker-compose up -d

# Production
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables
```bash
API_KEY=your-secure-api-key
NODE_ENV=production
PORT=3000
IMMUDB_HOST=immudb
IMMUDB_PORT=3322
IMMUDB_USER=immudb
IMMUDB_PASSWORD=immudb
```

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

### Code Standards
- Use ESLint for code formatting
- Write tests for all new features
- Follow RESTful API conventions
- Document all public APIs
- Maintain backward compatibility


##  Acknowledgments

- [Immudb](https://immudb.io/) - Immutable database
- [Express.js](https://expressjs.com/) - Web framework
- [Jest](https://jestjs.io/) - Testing framework
- [Postman](https://postman.com/) - API testing

---


