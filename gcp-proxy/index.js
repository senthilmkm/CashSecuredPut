const crypto = require('crypto');
const fetch = require('node-fetch');
const { isFreeTierRoute, serveFreeTier } = require('./deviceCheck');

const PUBLIC_COM_BASE_URL = 'https://api.public.com';

function hasValidProxyKey(req) {
  const expected = process.env.PROXY_ACCESS_SECRET || '';
  const provided = req.get('x-proxy-key') || '';
  if (!expected || !provided) {
    return false;
  }

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

exports.handler = async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-proxy-key');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (isFreeTierRoute(req.path || req.url)) {
    await serveFreeTier(req, res, process.env, fetch);
    return;
  }

  if (!hasValidProxyKey(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Get API secret key from Secure environment variables
  const apiKey = process.env.PUBLIC_API_SECRET;
  if (!apiKey) {
    res.status(500).json({ error: 'Server configuration error: PUBLIC_API_SECRET is missing.' });
    return;
  }

  const { symbol, accountId } = req.query;
  if (!symbol || !accountId) {
    res.status(400).json({ error: 'Missing required query parameters: symbol and accountId are required.' });
    return;
  }

  const rawPath = req.path || req.url.split('?')[0];
  const path = rawPath.replace(/\/$/, '') || '/';
  console.log(`[CSP-Proxy] Request received for path: ${path}, Symbol: ${symbol}`);

  try {
    // Exchange the Secret Key for a short-lived Bearer access token
    console.log('[CSP-Proxy] Initiating token exchange...');
    const accessToken = await getAccessToken(apiKey);
    console.log('[CSP-Proxy] Token exchange successful.');

    if (path === '/quotes') {
      const result = await handleQuotes(symbol, accountId, accessToken);
      res.status(200).json(result);
    } else if (path === '/options') {
      const parsedPrice = parseFloat(req.query.stockPrice);
      const stockPrice = isNaN(parsedPrice) || parsedPrice <= 0 ? 150.00 : parsedPrice;
      const optionType = (req.query.optionType || 'put').toLowerCase();
      const parsedDte = parseInt(req.query.dte, 10);
      const targetDte = isNaN(parsedDte) || parsedDte <= 0 ? 30 : parsedDte;

      const result = await handleOptions(symbol, stockPrice, accountId, accessToken, optionType, targetDte);
      res.status(200).json(result);
    } else {
      res.status(404).json({ error: `Not Found. Supported endpoints: /quotes, /options` });
    }
  } catch (error) {
    console.error('[CSP-Proxy] Error handling request:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};

async function getAccessToken(apiKey) {
  const url = `${PUBLIC_COM_BASE_URL}/userapiauthservice/personal/access-tokens`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      secret: apiKey.trim(),
      validityInMinutes: 10
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to exchange Public.com secret key (Status ${response.status}): ${text}`);
  }

  const data = await response.json();
  const token = data?.accessToken || data?.token;
  if (!token) {
    throw new Error('Public.com token response did not contain an accessToken.');
  }
  return token;
}

async function handleQuotes(symbol, accountId, accessToken) {
  const url = `${PUBLIC_COM_BASE_URL}/userapigateway/marketdata/${accountId}/quotes`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      instruments: [
        {
          symbol: symbol.toUpperCase(),
          type: 'EQUITY'
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Public Quotes API responded with ${response.status}: ${text}`);
  }

  const data = await response.json();
  const quote = data?.quotes?.[0] || data?.[0] || data?.results?.[0];
  if (!quote) {
    throw new Error(`No quote data returned from Public.com for symbol ${symbol}`);
  }

  const lastPrice = parseFloat(quote.lastPrice || quote.last || quote.price || 0);
  const bidPrice = parseFloat(quote.bid || 0);
  const askPrice = parseFloat(quote.ask || 0);
  
  if (!lastPrice && !bidPrice && !askPrice) {
    throw new Error(`Symbol ${symbol} is invalid or not available on Public.com.`);
  }

  const finalPrice = lastPrice || askPrice || bidPrice;

  return {
    symbol: symbol.toUpperCase(),
    price: finalPrice,
    change: parseFloat(quote.change || (finalPrice * 0.012).toFixed(2)),
    changePercent: parseFloat(quote.changePercent || 1.2),
  };
}

async function handleOptions(symbol, stockPrice, accountId, accessToken, optionType = 'put', targetDte = 30) {
  let targetPrice = stockPrice;

  // Automatically fetch the latest stock quote to use for option chain filtering
  try {
    console.log(`[CSP-Proxy] Fetching latest live stock price for option chain filtering on ${symbol}...`);
    const quote = await handleQuotes(symbol, accountId, accessToken);
    if (quote && quote.price > 0) {
      targetPrice = quote.price;
      console.log(`[CSP-Proxy] Live stock price retrieved for filtering: $${targetPrice}`);
    }
  } catch (quoteError) {
    console.warn(`[CSP-Proxy] Failed to fetch live stock quote for options filtering, using fallback $${targetPrice}:`, quoteError);
  }

  console.log(`[CSP-Proxy] Fetching option expirations for ${symbol}...`);
  // 1. Fetch Option Expirations
  const expUrl = `${PUBLIC_COM_BASE_URL}/userapigateway/marketdata/${accountId}/option-expirations`;
  const expResponse = await fetch(expUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      instrument: {
        symbol: symbol.toUpperCase(),
        type: 'EQUITY'
      }
    })
  });

  if (!expResponse.ok) {
    const text = await expResponse.text();
    throw new Error(`Public Expirations API responded with ${expResponse.status}: ${text}`);
  }

  const expData = await expResponse.json();
  const expirations = expData?.expirationDates || expData?.expirations || [];
  console.log(`[CSP-Proxy] Found ${expirations.length} expiration dates for ${symbol}.`);
  if (expirations.length === 0) {
    return [];
  }

  // 2. Smart Selection of Expirations covering short, medium, and the user's target DTE (e.g. 45 days)
  const now = Date.now();
  const sortedExpirations = expirations.sort();

  const expWithDte = sortedExpirations.map(exp => {
    const expTime = new Date(`${exp}T16:00:00Z`).getTime();
    const days = Math.max(1, Math.round((expTime - now) / (1000 * 60 * 60 * 24)));
    return { date: exp, days };
  });

  // Standard CSP trading milestones: Near weekly (7d), 2-week (14d), 1-month (30d), 45-day (45d), 2-month (60d), plus requested targetDte!
  const targetDays = Array.from(new Set([7, 14, 30, 45, 60, targetDte])).sort((a, b) => a - b);
  const selectedDatesSet = new Set();

  // Always include the nearest weekly expiration
  if (expWithDte.length > 0) {
    selectedDatesSet.add(expWithDte[0].date);
  }

  // Find the closest expiration for each milestone
  for (const tDay of targetDays) {
    let closest = expWithDte[0];
    let minDiff = Math.abs(closest.days - tDay);
    for (const item of expWithDte) {
      const diff = Math.abs(item.days - tDay);
      if (diff < minDiff) {
        minDiff = diff;
        closest = item;
      }
    }
    if (closest) {
      selectedDatesSet.add(closest.date);
    }
  }

  const targetDates = Array.from(selectedDatesSet).sort();
  console.log(`[CSP-Proxy] Target dates (targetDte: ${targetDte}):`, targetDates);

  // 3. Fetch all target expiration chains in parallel for speed
  const allContracts = [];
  const results = await Promise.all(
    targetDates.map(async (expDate) => {
      try {
        const chainUrl = `${PUBLIC_COM_BASE_URL}/userapigateway/marketdata/${accountId}/option-chain`;
        const chainResponse = await fetch(chainUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            instrument: {
              symbol: symbol.toUpperCase(),
              type: 'EQUITY'
            },
            expirationDate: expDate
          }),
          timeout: 10000
        });

        if (!chainResponse.ok) {
          console.warn(`[CSP-Proxy] Options API returned non-200 for ${expDate}: ${chainResponse.status}`);
          return [];
        }

        const chainData = await chainResponse.json();
        const contractsList = (optionType === 'call' ? chainData?.calls : chainData?.puts) || [];
        console.log(`[CSP-Proxy] Date ${expDate} returned ${optionType} list length: ${contractsList.length}`);

        const dateContracts = [];
        for (const item of contractsList) {
          const symbolStr = item.instrument?.symbol || item.symbol || item.optionSymbol || `${symbol}${expDate}P`;
          const details = item.optionDetails || {};
          const strike = parseFloat(details.strikePrice || item.strikePrice || item.strike || 0);
          const bid = parseFloat(item.bid || 0);
          const ask = parseFloat(item.ask || 0);
          const last = parseFloat(item.lastPrice || item.last || 0);
          const midPrice = parseFloat(details.midPrice || 0);
          const premium = midPrice || (bid && ask ? parseFloat(((bid + ask) / 2).toFixed(2)) : (last || bid || ask || 0.05));

          if (strike > 0) {
            dateContracts.push({
              symbol: symbolStr,
              strike,
              expiration: expDate,
              type: optionType,
              bid,
              ask,
              last,
              premium
            });
          }
        }
        return dateContracts;
      } catch (innerError) {
        console.error(`[CSP-Proxy] Error fetching options chain for date ${expDate}:`, innerError);
        return [];
      }
    })
  );

  for (const dateList of results) {
    allContracts.push(...dateList);
  }

  // Filter strikes within 25% of the current stock price
  const filtered = allContracts.filter(c => {
    const diffPct = Math.abs(c.strike - targetPrice) / targetPrice;
    return diffPct <= 0.25;
  });
  console.log(`[CSP-Proxy] Filtered options size centering around $${targetPrice}: ${filtered.length} / ${allContracts.length}`);

  return filtered.sort((a, b) => {
    if (a.expiration !== b.expiration) {
      return a.expiration.localeCompare(b.expiration);
    }
    return a.strike - b.strike;
  });
}