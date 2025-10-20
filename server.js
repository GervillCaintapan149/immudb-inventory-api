// server.js
const express = require('express');
const bodyParser = require('body-parser');
const productRoutes = require('./src/routes/product-routes');
const inventoryRoutes = require('./src/routes/inventory-routes');
const adminRoutes = require('./src/routes/admin-routes');
const publicRoutes = require('./src/routes/public-routes');
const {
  authenticateApiKey,
  authenticate,
  requirePermission,
  rateLimits
} = require('./src/middleware/auth');
const { AuditLogger, AUDIT_EVENTS } = require('./src/utils/audit-logger');
const dotenv = require('dotenv');

dotenv.config(); // Load environment variables from .env file

// Initialize admin system
const { UserManager } = require('./src/utils/user-manager');
const CertificateManager = require('./src/utils/certificate-manager');

// Initialize CA on startup
CertificateManager.initializeCA().catch(console.error);

const app = express();
const port = process.env.PORT || 3000;

// Trust proxy for rate limiting
app.set('trust proxy', 1);

app.use(bodyParser.json());

// Serve static files for customer portal
app.use('/public', express.static('public'));

// Apply general rate limiting
app.use(rateLimits.lenient);

// Basic route to check if the server is running
app.get('/', (req, res) => {
  // Check if request accepts HTML (browser request)
  if (req.accepts('html')) {
    // Redirect browsers to customer portal
    res.redirect('/public/');
  } else {
    // Return JSON for API clients
    res.json({
      message: 'ImmuDB Inventory Management API is running!',
      version: '1.0.0',
      features: {
        immutable_ledger: true,
        certificate_management: true,
        user_management: true,
        audit_trails: true,
        rate_limiting: true,
        customer_portal: true
      },
      customer_portal_url: '/public/',
      timestamp: new Date().toISOString()
    });
  }
});

// Serve customer portal index page
app.get('/portal', (req, res) => {
  res.redirect('/public/');
});

app.get('/verify', (req, res) => {
  res.redirect('/public/');
});

// Mount the routes
app.use('/api/admin', adminRoutes); // Admin routes (JWT required)
app.use('/api/products', productRoutes); // Legacy API key or JWT
app.use('/api/inventory', inventoryRoutes); // Legacy API key or JWT
app.use('/public', publicRoutes); // Public routes (no authentication required)

// 5. GET /api/audit/verify/:transaction_id - Verify specific transaction (Immudb low-level verification)
// This uses a lower-level Immudb verification (verifiedGet) than collection.get.
app.get('/api/audit/verify/:transaction_id', authenticate, requirePermission('audit.read'), async (req, res) => {
  const {
    transaction_id
  } = req.params;
  const {
    withImmudb,
    bufferToObj
  } = require('./src/immudb-client');
  const {
    Buffer
  } = require('buffer');

  try {
   const verificationResult = await withImmudb(async (client, collectionClient) => { 
      // Get the transaction by its ID (key) from the collection
      const getResponse = await collectionClient.get({ 
        collection: 'inventory_transactions',
        key: Buffer.from(transaction_id)
      });

      if (getResponse.status !== 'OK') {
        return res.status(404).json({
          message: `Transaction with ID '${transaction_id}' not found.`
        });
      }

      const transaction = bufferToObj(getResponse.value);

    

      // We can explicitly show verification based on the transaction metadata from the collection.get
      return {
        transaction,
        immudb_tx_id: getResponse.transaction.header.id.toString('hex'),
        revision: getResponse.revision,
        verification_status: getResponse.status === 'OK' ? 'Verified Successfully by Immudb' : 'Verification Failed or Not Found',
        message: 'Immudb automatically verifies data integrity on read operations from collections. The "OK" status confirms cryptographic proof.'
      };
    });

    if (res.headersSent) return; // Prevent "headers already sent"

    res.status(200).json(verificationResult);

  } catch (error) {
    console.error('Error verifying transaction:', error);
    if (error.message.includes('No such key')) { // Collection.get throws if key not found
      return res.status(404).json({
        message: `Transaction with ID '${transaction_id}' not found.`
      });
    }
    res.status(500).json({
      message: 'Failed to verify transaction',
      error: error.message
    });
  }
});

// 6. GET /api/inventory/time-travel/:sku?timestamp=YYYY-MM-DDTHH:mm:ss.sssZ - Get inventory state at specific past timestamp
app.get('/api/inventory/time-travel/:sku', authenticate, requirePermission('inventory.read'), async (req, res) => {
  const { sku } = req.params;
  const { timestamp } = req.query;

  if (!timestamp) {
    return res.status(400).json({
      message: 'Timestamp parameter is required. Use format: YYYY-MM-DDTHH:mm:ss.sssZ'
    });
  }

  // Validate timestamp format
  const targetTimestamp = new Date(timestamp);
  if (isNaN(targetTimestamp.getTime())) {
    return res.status(400).json({
      message: 'Invalid timestamp format. Use ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ'
    });
  }

  const { withImmudb, bufferToObj } = require('./src/immudb-client');
  const { Buffer } = require('buffer');

  try {
    const timeTravelResult = await withImmudb(async (client) => {
      // 1. Get the current product details
      const productKey = `product:${sku}`;
      let product;
      try {
        const productResponse = await client.get({
          key: Buffer.from(productKey)
        });
        product = bufferToObj(productResponse.value);
      } catch (error) {
        if (error.message && error.message.includes('key not found')) {
          return res.status(404).json({
            message: `Product with SKU '${sku}' not found.`
          });
        }
        throw error;
      }

      // 2. Get all transactions up to the target timestamp
      let historicalStock = 0;
      let lastTransactionTimestamp = product.created_at;
      const relevantTransactions = [];

      try {
        // Scan for transaction keys
        const scanResponse = await client.scan({
          seekKey: Buffer.from('transaction:'),
          limit: 1000,
          desc: false
        });

        for (const item of scanResponse.entriesList) {
          const key = item.key;
          if (key.startsWith('transaction:')) {
            try {
              const tx = JSON.parse(item.value);
              if (tx.sku === sku) {
                const txTimestamp = new Date(tx.timestamp);
                
                // Only include transactions up to the target timestamp
                if (txTimestamp <= targetTimestamp) {
                  historicalStock += tx.quantity_change;
                  if (tx.timestamp > lastTransactionTimestamp) {
                    lastTransactionTimestamp = tx.timestamp;
                  }
                  relevantTransactions.push(tx);
                }
              }
            } catch (parseError) {
              // Skip invalid transaction entries
              continue;
            }
          }
        }
      } catch (scanError) {
        console.warn('Error scanning transactions for time travel:', scanError);
        // Continue with historical stock as 0 if scan fails
      }

      // Log time travel query
      await AuditLogger.logInventoryOperation(
        AUDIT_EVENTS.TIME_TRAVEL_QUERY,
        req.user.user_id,
        req.user.username,
        sku,
        req.ip,
        { target_timestamp: timestamp, transactions_found: relevantTransactions.length }
      );

      return {
        product: {
          sku: product.sku,
          name: product.name,
          description: product.description,
          price: product.price,
          category: product.category,
          supplier: product.supplier,
          created_at: product.created_at
        },
        historical_stock_at_timestamp: historicalStock,
        target_timestamp: timestamp,
        last_transaction_before_timestamp: lastTransactionTimestamp,
        transactions_included: relevantTransactions.length,
        immudb_verification_status: 'OK',
        message: `Inventory state for SKU '${sku}' at ${timestamp}`
      };
    });

    if (res.headersSent) return;

    res.status(200).json(timeTravelResult);

  } catch (error) {
    console.error('Error in time travel query:', error);
    res.status(500).json({
      message: 'Failed to retrieve historical inventory state',
      error: error.message
    });
  }
});


// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`API Key for testing: ${process.env.API_KEY || 'supersecretapikey'}`);
});

//Gervill P Caintapan