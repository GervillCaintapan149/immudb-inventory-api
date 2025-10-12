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
  Buffer
} = require('buffer');

// Collection name for products
const PRODUCTS_COLLECTION = 'products';

// 1. POST /api/products - Add new product
router.post('/', authenticateApiKey, async (req, res) => {
  const {
    sku,
    name,
    description,
    price,
    quantity,
    category,
    supplier
  } = req.body;

  if (!sku || !name || price == null || quantity == null) {
    return res.status(400).json({
      message: 'Missing required product fields (sku, name, price, quantity)'
    });
  }

  try {
    const newProduct = {
      sku,
      name,
      description,
      price,
      initial_quantity: quantity,
      category,
      supplier,
      created_at: new Date().toISOString()
    };

    const result = await withImmudb(async (client) => { 
      
      const productKey = `product:${sku}`;
      try {
        const existingProduct = await client.get({
          key: Buffer.from(productKey)
        });
        
        if (existingProduct) {
          return res.status(409).json({
            message: `Product with SKU '${sku}' already exists.`
          });
        }
      } catch (error) {
        if (error.message && !error.message.includes('key not found')) {
          throw error; 
        }
      }

      // Add the product using basic key-value operations
      const setResponse = await client.set({
        key: Buffer.from(productKey),
        value: objToBuffer(newProduct)
      });

      const verificationHash = setResponse.id.toString();

      // Create initial stock transaction
      const {
        generateUuid
      } = require('../utils/helpers');
      const initialTransaction = {
        transaction_id: generateUuid(),
        sku,
        type: 'IN',
        quantity_change: quantity,
        reason: 'Initial Stock',
        performed_by: req.headers['x-api-key'] ? 'API Key User' : 'System', 
        timestamp: new Date().toISOString()
      };

      const transactionKey = `transaction:${initialTransaction.transaction_id}`;
      await client.set({
        key: Buffer.from(transactionKey),
        value: objToBuffer(initialTransaction)
      });

      return {
        product: newProduct,
        immudb_tx_hash: verificationHash,
        message: 'Product added and initial stock recorded successfully.'
      };

    });

    if (result && result.message) { 
      return res.status(200).json(result);
    }

  } catch (error) {
    console.error('Error adding product:', error);
    if (error.message.includes('Key already exists')) {
      return res.status(409).json({
        message: `Product with SKU '${sku}' already exists.`
      });
    }
    res.status(500).json({
      message: 'Failed to add product',
      error: error.message
    });
  }
});

// 2. GET /api/products/:sku - Get current product details with stock level
router.get('/:sku', authenticateApiKey, async (req, res) => {
  const {
    sku
  } = req.params;

  try {
      const productDetails = await withImmudb(async (client) => { 
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

        // 2. Calculate current stock level from transactions
  
        let currentStock = 0;
        let lastTransactionTimestamp = product.created_at;
        
        try {
          const scanResponse = await client.scan({
            seekKey: Buffer.from('transaction:'),
            limit: 1000, 
            desc: false
          });

          const transactions = [];
          for (const item of scanResponse.items) {
            const key = item.key.toString();
            if (key.startsWith('transaction:')) {
              try {
                const tx = bufferToObj(item.value);
                if (tx.sku === sku) {
                  currentStock += tx.quantity_change;
                  if (tx.timestamp > lastTransactionTimestamp) {
                    lastTransactionTimestamp = tx.timestamp;
                  }
                  transactions.push(tx);
                }
              } catch (parseError) {
                continue;
              }
            }
          }
        } catch (scanError) {
          console.warn('Error scanning transactions:', scanError);
        }

        return {
          ...product,
          current_stock: currentStock,
          last_transaction_timestamp: lastTransactionTimestamp,
          immudb_verification_status: 'OK'
        };
    });

    if (res.headersSent) return; 

    res.status(200).json(productDetails);

  } catch (error) {
    console.error('Error getting product details:', error);
    if (error.message.includes('No such key')) {
      return res.status(404).json({
        message: `Product with SKU '${sku}' not found.`
      });
    }
    res.status(500).json({
      message: 'Failed to retrieve product details',
      error: error.message
    });
  }
});


module.exports = router;