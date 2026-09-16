// Unified Public Market API provider for CashSecuredProfit (Public.com Proxy + Alpaca Fallback)

import { fetchStockQuote, fetchOptionChain, StockQuote, CSPOptionContract } from './alpaca';
import { BROKER_CONFIG } from '../config/broker';

export { StockQuote, CSPOptionContract };

/**
 * Fetches stock price quote from the GCP Cloud Function proxy (Public.com)
 */
export async function fetchStockQuoteFromProxy(
  symbol: string,
  accountId: string,
  proxyUrl: string
): Promise<StockQuote> {
  const cleanSymbol = symbol.trim().toUpperCase();
  const cleanProxyUrl = proxyUrl.replace(/\/$/, '');
  
  const url = `${cleanProxyUrl}/quotes?symbol=${cleanSymbol}&accountId=${accountId}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  let data: any;
  try {
    data = await response.json();
  } catch (e) {
    if (!response.ok) {
      throw new Error(`Proxy quotes call failed with status: ${response.status}`);
    }
  }

  if (data && data.error) {
    throw new Error(data.error);
  }

  return {
    symbol: cleanSymbol,
    price: data.price,
    change: data.change || 0,
    changePercent: data.changePercent || 0,
    isMocked: false,
  };
}

/**
 * Fetches put options chain from the GCP Cloud Function proxy (Public.com)
 */
export async function fetchPutOptionChainFromProxy(
  symbol: string,
  stockPrice: number,
  accountId: string,
  proxyUrl: string
): Promise<CSPOptionContract[]> {
  const cleanSymbol = symbol.trim().toUpperCase();
  const cleanProxyUrl = proxyUrl.replace(/\/$/, '');

  const url = `${cleanProxyUrl}/options?symbol=${cleanSymbol}&accountId=${accountId}&stockPrice=${stockPrice}&optionType=put`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  let data: any;
  try {
    data = await response.json();
  } catch (e) {
    if (!response.ok) {
      throw new Error(`Proxy options call failed with status: ${response.status}`);
    }
  }

  if (data && data.error) {
    throw new Error(data.error);
  }

  // Ensure items map as puts
  if (Array.isArray(data)) {
    return data.map((item: any) => ({
      symbol: item.symbol,
      strike: item.strike,
      expiration: item.expiration,
      type: 'put',
      bid: item.bid || 0,
      ask: item.ask || 0,
      last: item.last || item.premium || 0,
      premium: item.premium || item.last || 0,
    }));
  }

  return [];
}

/**
 * Unified Quote Fetcher: Tries Public.com proxy first, falls back to Alpaca
 */
export async function getMarketQuote(symbol: string): Promise<StockQuote> {
  if (BROKER_CONFIG.PROXY_URL && BROKER_CONFIG.PUBLIC_COM_ACCOUNT_ID) {
    try {
      return await fetchStockQuoteFromProxy(symbol, BROKER_CONFIG.PUBLIC_COM_ACCOUNT_ID, BROKER_CONFIG.PROXY_URL);
    } catch (err) {
      console.warn('[MarketData] Public.com proxy quote failed, falling back to Alpaca:', err);
    }
  }
  return await fetchStockQuote(symbol);
}

/**
 * Unified Option Chain Fetcher: Tries Public.com proxy first, falls back to Alpaca
 */
export async function getPutOptionChain(symbol: string, stockPrice: number): Promise<CSPOptionContract[]> {
  if (BROKER_CONFIG.PROXY_URL && BROKER_CONFIG.PUBLIC_COM_ACCOUNT_ID) {
    try {
      const chain = await fetchPutOptionChainFromProxy(symbol, stockPrice, BROKER_CONFIG.PUBLIC_COM_ACCOUNT_ID, BROKER_CONFIG.PROXY_URL);
      if (chain && chain.length > 0) {
        return chain;
      }
    } catch (err) {
      console.warn('[MarketData] Public.com proxy options failed, falling back to Alpaca:', err);
    }
  }
  return await fetchOptionChain(symbol, stockPrice);
}