const ImmudbClient = require('immudb-node').default; 

const {
  Buffer
} = require('buffer');

const IMMUDB_HOST = '127.0.0.1';
const IMMUDB_PORT = 3322;
const IMMUDB_USER = 'immudb';
const IMMUDB_PASSWORD = 'immudb';
const IMMUDB_DB_NAME = 'defaultdb';

// Initialize the ImmudbClient
const client = new ImmudbClient({
  host: IMMUDB_HOST,
  port: IMMUDB_PORT,
  // Try to prevent automatic database operations
  rootPath: '/tmp/immudb'
});

/**
 * Logs into Immudb, performs operations, and logs out.
 * Ensures the client is always logged in for operations.
 * @param {Function} callback - The function to execute with the authenticated client.
 * @returns {Promise<any>} The result of the callback function.
 */
async function withImmudb(callback) {
  let loginResponse;
  try {
    loginResponse = await client.login({
      user: IMMUDB_USER,
      password: IMMUDB_PASSWORD,
    });


    const result = await callback(client);

    return result;
  } catch (error) {
    console.error('Immudb operation failed:', error);
    throw error;
  } finally {
    if (loginResponse) {
      try {
        await client.logout();
      } catch (logoutError) {
        console.error('Error during Immudb logout:', logoutError);
      }
    }
  }
}

const objToBuffer = (obj) => Buffer.from(JSON.stringify(obj));
const bufferToObj = (buf) => JSON.parse(buf.toString());

module.exports = {
  withImmudb,
  objToBuffer,
  bufferToObj,
  ImmudbClient // Export ImmudbClient
};

//Gervill Paterez Caintapan