const express = require('express');
const router = express.Router();
const {
  withImmudb,
  objToBuffer,
  bufferToObj
} = require('../immudb-client');
const {
  authenticateApiKey
} = require('../middleware/auth');
const {
  generateUuid
} = require('../utils/helpers');
const {
  Buffer
} = require('buffer');

const PRODUCTS_COLLECTION = 'products';
const TRANSACTIONS_COLLECTION = 'inventory_transactions';

// 3. POST /api/inventory/transaction - Record inventory movement
router.post('/transaction', authenticateApiKey, async (req, res) => {
  const {
    sku,
    type,
    quantity,
    reason
  } = req.body; 

  if (!sku || !type || quantity == null || quantity <= 0 || !reason) {
    return res.status(400).json({
      message: 'Missing or invalid transaction fields (sku, type, quantity, reason). Quantity must be positive.'
    });
  }

  const validTypes = ['IN', 'OUT', 'ADJUSTMENT'];
  if (!validTypes.includes(type.toUpperCase())) {
    return res.status(400).json({
      message: `Invalid transaction type. Must be one of: ${validTypes.join(', ')}`
    });
  }

  try {
    const result = await withImmudb(async (client, collectionClient) => { 
      const productGetResponse = await collectionClient.get({ 
        collection: PRODUCTS_COLLECTION,
        key: Buffer.from(sku)
      });

      if (productGetResponse.status !== 'OK') {
        return res.status(404).json({
          message: `Product with SKU '${sku}' not found.`
        });
      }

      // 2. Calculate current stock to check for negative stock on 'OUT' transactions
      const transactionsResponse = await collectionClient.getAll({ 
      collection: TRANSACTIONS_COLLECTION,
        query: {
          expressions: [{
            fieldComparisons: [{
              field: 'sku',
              operator: 'EQ',
              value: {
                s: sku
              }
            }],
          }],
        },
      });

      let currentStock = 0;
      transactionsResponse.rows.forEach(row => {
        const tx = bufferToObj(row.value);
        currentStock += tx.quantity_change;
      });

      let quantityChange = quantity;
      if (type.toUpperCase() === 'OUT') {
        quantityChange = -quantity;
        if (currentStock + quantityChange < 0) { 
          return res.status(400).json({
            message: `Insufficient stock for SKU '${sku}'. Current stock: ${currentStock}, attempting to remove: ${quantity}.`
          });
        }
      }

      const transaction = {
        transaction_id: generateUuid(),
        sku,
        type: type.toUpperCase(),
        quantity_change: quantityChange,
        reason,
        performed_by: req.headers['x-api-key'] ? 'API Key User' : 'System',
        timestamp: new Date().toISOString()
      };

      // 3. Store the inventory transaction
      const setResponse = await collectionClient.set({ 
        collection: TRANSACTIONS_COLLECTION,
        kv_pairs: [{
          key: Buffer.from(transaction.transaction_id),
          value: objToBuffer(transaction),
        }],
     });

      const verificationHash = setResponse.transaction.header.id.toString('hex');

      return {
        transaction,
        immudb_tx_hash: verificationHash,
        message: 'Inventory transaction recorded successfully.'
      };
    });

    if (result && result.message && result.message.includes('Insufficient stock')) {
      return res.status(400).json(result);
    }
    if (result && result.message && result.message.includes('not found')) {
      return res.status(404).json(result);
    }
    if (result) {
      return res.status(201).json(result);
    }


  } catch (error) {
    console.error('Error recording inventory transaction:', error);
    res.status(500).json({
      message: 'Failed to record inventory transaction',
      error: error.message
    });
  }
});


// 4. GET /api/inventory/history/:sku - Return complete transaction history for a product
router.get('/history/:sku', authenticateApiKey, async (req, res) => {
  const {
    sku
  } = req.params;

  try {
    const history = await withImmudb(async (client, collectionClient) => { 
        const productGetResponse = await collectionClient.get({ 
          collection: PRODUCTS_COLLECTION,
          key: Buffer.from(sku)
        });

      if (productGetResponse.status !== 'OK') {
        return res.status(404).json({
          message: `Product with SKU '${sku}' not found.`
        });
      }

      const transactionsResponse = await collectionClient.getAll({ 
       collection: TRANSACTIONS_COLLECTION,
        query: {
          expressions: [{
            fieldComparisons: [{
              field: 'sku',
              operator: 'EQ',
              value: {
                s: sku
              }
            }],
          }],
        },
       
      });

      let runningBalance = 0;
      const verifiedTransactions = transactionsResponse.rows.map(row => {
        const tx = bufferToObj(row.value);
        runningBalance += tx.quantity_change;
        return {
          ...tx,
          running_balance: runningBalance,
          immudb_tx_id: row.transaction.header.id.toString('hex'), 
          immudb_verification_status: 'Verified (Collection Get)' 
        };
      }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); 

      return verifiedTransactions;
    });

    if (res.headersSent) return; 

    res.status(200).json(history);

  } catch (error) {
    console.error('Error getting transaction history:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({
        message: `Product with SKU '${sku}' not found.`
      });
    }
    res.status(500).json({
      message: 'Failed to retrieve transaction history',
      error: error.message
    });
  }
});

// 6. GET /api/inventory/snapshot - Return current inventory levels for all products
router.get('/snapshot', authenticateApiKey, async (req, res) => {
  try {
    const snapshot = await withImmudb(async (client, collectionClient) => { 
      const allProductsResponse = await collectionClient.getAll({ 
        collection: PRODUCTS_COLLECTION,
      });

      const products = allProductsResponse.rows.map(row => bufferToObj(row.value));

      const inventorySnapshot = [];

     for (const product of products) {
      const transactionsResponse = await collectionClient.getAll({ 
        collection: TRANSACTIONS_COLLECTION,
          query: {
            expressions: [{
              fieldComparisons: [{
                field: 'sku',
                operator: 'EQ',
                value: {
                  s: product.sku
                }
              }],
            }],
          },
        });

        let currentStock = 0;
        let lastTransactionTimestamp = product.created_at;

        transactionsResponse.rows.forEach(row => {
          const tx = bufferToObj(row.value);
          currentStock += tx.quantity_change;
          if (tx.timestamp > lastTransactionTimestamp) {
            lastTransactionTimestamp = tx.timestamp;
          }
        });

        inventorySnapshot.push({
          sku: product.sku,
          name: product.name,
          current_stock: currentStock,
          last_transaction_timestamp: lastTransactionTimestamp,
         
        });
      }
      return inventorySnapshot.sort((a, b) => a.sku.localeCompare(b.sku));
    });

    res.status(200).json(snapshot);

  } catch (error) {
    console.error('Error getting inventory snapshot:', error);
    res.status(500).json({
      message: 'Failed to retrieve inventory snapshot',
      error: error.message
    });
  }
});


module.exports = router;