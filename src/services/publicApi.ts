// Unified Public Market API provider for CashSecuredProfit (Public.com Proxy + Alpaca Fallback)

import { fetchStockQuote, fetchOptionChain, StockQuote, CSPOptionContract } from './alpaca';
import { BROKER_CONFIG } from '../config/broker';

export { StockQuote, CSPOptionContract };

function proxyRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const proxyKey = process.env.EXPO_PUBLIC_PROXY_ACCESS_SECRET;
  if (proxyKey) {
    headers['x-proxy-key'] = proxyKey;
  }
  return headers;
}

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
    headers: proxyRequestHeaders(),
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
    price: typeof data?.price === 'number' ? data.price : 0,
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
  proxyUrl: string,
  dte?: number
): Promise<CSPOptionContract[]> {
  const cleanSymbol = symbol.trim().toUpperCase();
  const cleanProxyUrl = proxyUrl.replace(/\/$/, '');

  const dteParam = dte ? `&dte=${dte}` : '';
  const url = `${cleanProxyUrl}/options?symbol=${cleanSymbol}&accountId=${accountId}&stockPrice=${stockPrice}&optionType=put${dteParam}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: proxyRequestHeaders(),
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

  // Ensure items map as puts only if they are genuinely PUT options
  if (Array.isArray(data)) {
    const putContracts = data.filter((item: any) => {
      // Discard explicitly labeled calls
      if (item.type && item.type.toLowerCase() === 'call') return false;
      // Discard standard OCC format call symbols (e.g. AAPL261104C00275000)
      if (typeof item.symbol === 'string' && /^[A-Z]+\d{6}C\d{8}$/i.test(item.symbol)) return false;
      // Accept if explicitly marked as put or OCC put symbol (e.g. AAPL261104P00275000)
      return (
        item.type?.toLowerCase() === 'put' ||
        (typeof item.symbol === 'string' && /^[A-Z]+\d{6}P\d{8}$/i.test(item.symbol))
      );
    });

    if (putContracts.length > 0) {
      return putContracts.map((item: any) => ({
        symbol: item.symbol,
        strike: typeof item.strike === 'number' ? item.strike : parseFloat(item.strike) || 0,
        expiration: item.expiration,
        type: 'put',
        bid: item.bid || 0,
        ask: item.ask || 0,
        last: item.last || item.premium || 0,
        premium: item.premium || item.last || 0,
        impliedVolatility: typeof item.impliedVolatility === 'number' ? item.impliedVolatility : typeof item.iv === 'number' ? item.iv : undefined,
        isMocked: false,
      }));
    }
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
export async function getPutOptionChain(symbol: string, stockPrice: number, dte?: number): Promise<CSPOptionContract[]> {
  if (BROKER_CONFIG.PROXY_URL && BROKER_CONFIG.PUBLIC_COM_ACCOUNT_ID) {
    try {
      const chain = await fetchPutOptionChainFromProxy(symbol, stockPrice, BROKER_CONFIG.PUBLIC_COM_ACCOUNT_ID, BROKER_CONFIG.PROXY_URL, dte);
      if (chain && chain.length > 0) {
        return chain;
      }
    } catch (err) {
      console.warn('[MarketData] Public.com proxy options failed, falling back to Alpaca:', err);
    }
  }
  return await fetchOptionChain(symbol, stockPrice);
}