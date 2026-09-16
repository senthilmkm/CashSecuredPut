const functions = require('@google-cloud/functions-framework');
const axios = require('axios');

functions.http('alpacaProxy', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, APCA-API-KEY-ID, APCA-API-SECRET-KEY');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { endpoint, symbol } = req.query;
    if (!symbol) {
      res.status(400).json({ error: 'Symbol parameter required' });
      return;
    }

    const apiKey = req.headers['apca-api-key-id'] || process.env.ALPACA_KEY_ID;
    const apiSecret = req.headers['apca-api-secret-key'] || process.env.ALPACA_SECRET;

    const targetUrl = endpoint === 'options'
      ? `https://data.alpaca.markets/v1beta1/options/snapshots/${symbol}?feed=indicative`
      : `https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`;

    const response = await axios.get(targetUrl, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
        'Accept': 'application/json',
      },
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Alpaca Proxy Error:', error.message);
    res.status(500).json({ error: 'Proxy request failed', details: error.message });
  }
});