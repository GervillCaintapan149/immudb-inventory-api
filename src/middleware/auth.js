const API_KEY = process.env.API_KEY || 'supersecretapikey'; // Use environment variable in production!

const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({
      message: 'Unauthorized: Invalid or missing API Key'
    });
  }
  next();
};

module.exports = {
  authenticateApiKey
};