import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { CSPTrade } from '../hooks/useAppStorage';

/**
 * Converts trades array into CSV text string
 */
export function generateTradesCSV(trades: CSPTrade[], history: CSPTrade[] = []): string {
  const headers = [
    'Ticker',
    'Status',
    'Stock Price',
    'Strike Price',
    'Premium',
    'Contracts',
    'Collateral ($)',
    'Net Income ($)',
    'Effective Cost Basis ($)',
    'DTE',
    'Expiration Date',
    'Date Logged',
  ];

  const allTrades = [...trades, ...history];

  const rows = allTrades.map((t) => [
    t.ticker,
    t.status || 'active',
    t.stockPrice.toFixed(2),
    t.strikePrice.toFixed(2),
    t.premium.toFixed(2),
    t.contracts,
    (t.strikePrice * 100 * t.contracts).toFixed(2),
    ((t.cumulativePremium || t.premium) * 100 * t.contracts - t.commissions).toFixed(2),
    (t.strikePrice - t.premium).toFixed(2),
    t.dte,
    t.expirationDate,
    t.dateAdded ? new Date(t.dateAdded).toISOString().split('T')[0] : '',
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Generates and shares a PDF portfolio report using Expo Print & Sharing
 */
export async function exportPortfolioPDF(trades: CSPTrade[], history: CSPTrade[] = []): Promise<boolean> {
  const totalCollateral = trades.reduce((sum, t) => sum + t.strikePrice * 100 * t.contracts, 0);
  const activeIncome = trades.reduce((sum, t) => sum + (t.cumulativePremium || t.premium) * 100 * t.contracts - t.commissions, 0);
  const historicIncome = history.reduce((sum, t) => sum + (t.cumulativePremium || t.premium) * 100 * t.contracts - t.commissions, 0);
  const totalIncome = activeIncome + historicIncome;

  const tradeRowsHtml = trades
    .map(
      (t) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">${t.ticker}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">$${t.strikePrice.toFixed(2)} Put</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">$${t.stockPrice.toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #10B981; font-weight: bold;">+$${((t.cumulativePremium || t.premium) * 100 * t.contracts - t.commissions).toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">$${(t.strikePrice - t.premium).toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">$${(t.strikePrice * 100 * t.contracts).toLocaleString()}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${t.dte} days (${t.expirationDate})</td>
    </tr>
  `
    )
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>CashSecuredProfit Portfolio Report</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; padding: 24px; }
          h1 { color: #0b0f19; font-size: 24px; margin-bottom: 4px; }
          p { color: #64748b; font-size: 13px; margin-top: 0; }
          .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; display: flex; justify-content: space-between; }
          .stat-box { display: inline-block; width: 30%; }
          .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
          .stat-val { font-size: 18px; font-weight: bold; color: #0f172a; margin-top: 4px; }
          .stat-val-green { font-size: 18px; font-weight: bold; color: #059669; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th { background: #0f172a; color: #fff; padding: 10px 8px; text-align: left; }
        </style>
      </head>
      <body>
        <h1>CashSecuredProfit Portfolio Report</h1>
        <p>Generated on ${new Date().toLocaleDateString()} | All-in-One Options Income Suite</p>

        <div class="summary-card">
          <div class="stat-box">
            <div class="stat-label">Total Collateral Locked</div>
            <div class="stat-val">$${totalCollateral.toLocaleString()}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Active Premium Income</div>
            <div class="stat-val-green">+$${activeIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Lifetime Realized Income</div>
            <div class="stat-val-green">+$${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>

        <h2>Active Cash-Secured Put Positions (${trades.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Strike</th>
              <th>Stock Price</th>
              <th>Net Premium</th>
              <th>Cost Basis</th>
              <th>Collateral</th>
              <th>Expiration</th>
            </tr>
          </thead>
          <tbody>
            ${tradeRowsHtml || '<tr><td colspan="7" style="padding: 12px; text-align: center;">No active positions</td></tr>'}
          </tbody>
        </table>
      </body>
    </html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({ html: htmlContent });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      return true;
    }
    return false;
  } catch (error) {
    console.warn('PDF export failed:', error);
    return false;
  }
}
