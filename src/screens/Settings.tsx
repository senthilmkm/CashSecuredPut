import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Crown,
  HelpCircle,
  FileText,
  Shield,
  Trash2,
  Printer,
  ChevronRight,
  ArrowRight,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import { CSPTrade } from '../hooks/useAppStorage';

interface SettingsProps {
  isPremium: boolean;
  retentionDays: number;
  updateRetentionDays: (days: number) => void;
  expirationAlertThreshold: number;
  updateExpirationAlertThreshold: (days: number) => void;
  trades: CSPTrade[];
  history: CSPTrade[];
  onClearData: () => void;
  onOpenPaywall: () => void;
  navigation?: any;
}

const FAQ_ITEMS = [
  {
    q: 'What is a Cash-Secured Put (CSP)?',
    a: 'A Cash-Secured Put is an options strategy where you sell a Put option and set aside enough cash collateral (Strike Price × 100 shares) to buy the stock if assigned. You collect a cash premium upfront.',
  },
  {
    q: 'How does The Wheel Strategy work?',
    a: 'The Wheel is a 2-step income strategy: 1) Sell Cash-Secured Puts to generate yield. 2) If assigned, take ownership of stock at a discount and sell Covered Calls (via CoveredProfit) until called away.',
  },
  {
    q: 'What is Effective Stock Cost Basis?',
    a: 'Your effective cost basis if assigned is: Strike Price - Put Premium Collected. For example, selling a $150 Put for $5 premium yields an effective purchase price of $145/share.',
  },
  {
    q: 'How is the Health Scorecard calculated?',
    a: 'The Scorecard (0–100) evaluates Return on Capital (ROC %), Annualized APR/APY, Safety Cushion (Distance to Strike %), and Risk-Free Treasury Yield Spreads.',
  },
];

export default function Settings({
  isPremium,
  retentionDays,
  updateRetentionDays,
  expirationAlertThreshold,
  updateExpirationAlertThreshold,
  trades,
  history,
  onClearData,
  onOpenPaywall,
}: SettingsProps) {
  const [expandedFaqIndex, setExpandedFaqIndex] = useState<number | null>(null);

  // Custom slider values for retention
  const retentionValues = [30, 90, 180, 365, 9999];
  const retentionLabels = ['30 Days', '90 Days', '180 Days', '1 Year', 'All Time'];
  const currentRetentionIndex = Math.max(0, retentionValues.indexOf(retentionDays));

  // Custom slider values for expiration alerts
  const alertValues = [0, 1, 3, 5, 7];
  const alertLabels = ['Off', '1 Day', '3 Days', '5 Days', '7 Days'];
  const currentAlertIndex = Math.max(0, alertValues.indexOf(expirationAlertThreshold));

  const handleExportCSV = async () => {
    if (!isPremium) {
      onOpenPaywall();
      return;
    }

    try {
      const allTrades = [...trades, ...history];
      if (allTrades.length === 0) {
        Alert.alert('No Data to Export', 'Your trade portfolio is currently empty.');
        return;
      }

      let csvContent = 'ID,Ticker,Status,StockPrice,StrikePrice,Premium,Contracts,DTE,NetIncome,EffectiveCost,CreatedAt\n';
      allTrades.forEach((t) => {
        const netIncome = t.premium * 100 * t.contracts - t.commissions;
        const effectiveCost = t.strikePrice - t.premium;
        csvContent += `${t.id},${t.ticker},${t.status},${t.stockPrice},${t.strikePrice},${t.premium},${t.contracts},${t.dte},${netIncome.toFixed(2)},${effectiveCost.toFixed(2)},${t.createdAt}\n`;
      });

      const fileUri = `${FileSystem.documentDirectory}CashSecuredProfit_Portfolio.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Export Successful', `CSV saved to ${fileUri}`);
      }
    } catch (error: any) {
      Alert.alert('Export Error', error.message || 'Failed to export CSV file.');
    }
  };

  const handleExportPDF = async () => {
    if (!isPremium) {
      onOpenPaywall();
      return;
    }

    try {
      const allTrades = [...trades, ...history];
      if (allTrades.length === 0) {
        Alert.alert('No Data to Export', 'Your trade portfolio is currently empty.');
        return;
      }

      let rowsHtml = '';
      allTrades.forEach((t) => {
        const netIncome = (t.premium * 100 * t.contracts - t.commissions).toFixed(2);
        const effectiveCost = (t.strikePrice - t.premium).toFixed(2);
        const collateral = (t.strikePrice * 100 * t.contracts).toLocaleString();

        rowsHtml += `
          <tr>
            <td><strong>${t.ticker}</strong></td>
            <td>$${t.strikePrice.toFixed(2)}</td>
            <td>$${t.stockPrice.toFixed(2)}</td>
            <td>$${t.premium.toFixed(2)}</td>
            <td>${t.contracts}</td>
            <td>$${collateral}</td>
            <td style="color: #10B981;">+$${netIncome}</td>
            <td>$${effectiveCost}</td>
            <td>${t.status}</td>
          </tr>
        `;
      });

      const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: Helvetica, Arial, sans-serif; padding: 20px; color: #0f172a; }
              h1 { color: #0B0F19; border-bottom: 2px solid #3B82F6; padding-bottom: 8px; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 12px; }
              th { background-color: #f1f5f9; font-weight: bold; }
              .footer { margin-top: 30px; font-size: 10px; color: #64748b; text-align: center; }
            </style>
          </head>
          <body>
            <h1>CashSecuredProfit Portfolio Report</h1>
            <p>Generated on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Strike</th>
                  <th>Stock Price</th>
                  <th>Premium</th>
                  <th>Contracts</th>
                  <th>Collateral</th>
                  <th>Net Income</th>
                  <th>Effective Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
            <div class="footer">CashSecuredProfit — Options Yield & Wheel Strategy Companion</div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('PDF Generated', `File saved to ${uri}`);
      }
    } catch (error: any) {
      Alert.alert('PDF Export Failed', error.message || 'Could not generate PDF report.');
    }
  };

  const handleConfirmClearData = () => {
    Alert.alert(
      'Clear All Portfolio Data?',
      'This will permanently delete all active trades and trade history from your device. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All Data',
          style: 'destructive',
          onPress: onClearData,
        },
      ]
    );
  };

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open webpage link.');
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      
      {/* 1. Premium Upgrade Banner (Matching CoveredProfit) */}
      <View style={styles.premiumBanner}>
        <Crown size={28} color="#F59E0B" style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.premiumTitle}>CashSecuredProfit {isPremium ? 'Pro' : 'Free Tier'}</Text>
          <Text style={styles.premiumDesc}>
            {isPremium ? 'Unlimited Portfolio Tracking & Pro Tools Active' : '7-Day Free App Trial active. Upgrade for lifetime Pro features.'}
          </Text>
        </View>
        {!isPremium && (
          <TouchableOpacity style={styles.premiumBtn} onPress={onOpenPaywall} activeOpacity={0.85}>
            <Text style={styles.premiumBtnText}>Upgrade</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 2. Strategy Guide & FAQ Accordion */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Strategy Guide & FAQ</Text>
        {FAQ_ITEMS.map((item, idx) => {
          const isExpanded = expandedFaqIndex === idx;
          return (
            <View key={idx} style={styles.faqItem}>
              <TouchableOpacity
                style={styles.faqHeader}
                onPress={() => setExpandedFaqIndex(isExpanded ? null : idx)}
                activeOpacity={0.7}
              >
                <Text style={styles.faqQuestion}>{item.q}</Text>
                {isExpanded ? <ChevronUp size={16} color="#3B82F6" /> : <ChevronDown size={16} color="#94A3B8" />}
              </TouchableOpacity>
              {isExpanded && <Text style={styles.faqAnswer}>{item.a}</Text>}
            </View>
          );
        })}
      </View>

      {/* 3. Data Retention Policy (Custom Snapping Slider) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Retention Policy</Text>
        <Text style={styles.description}>Automatically prune archived trade history after selected timeframe.</Text>

        <View style={styles.sliderContainer}>
          <View style={styles.sliderTrack} />
          <View style={[styles.sliderFill, { width: `${(currentRetentionIndex / 4) * 100}%` }]} />
          <View style={styles.nodesRow}>
            {retentionValues.map((val, idx) => (
              <TouchableOpacity
                key={val}
                style={[styles.sliderNode, idx === currentRetentionIndex && styles.sliderNodeSelected]}
                onPress={() => updateRetentionDays(val)}
              />
            ))}
          </View>
        </View>
        <View style={styles.sliderLabels}>
          {retentionLabels.map((label, idx) => (
            <Text
              key={label}
              style={[styles.sliderLabelText, idx === currentRetentionIndex && styles.sliderLabelTextActive]}
              onPress={() => updateRetentionDays(retentionValues[idx])}
            >
              {label}
            </Text>
          ))}
        </View>
      </View>

      {/* 4. Expiration Alert Thresholds (Custom Snapping Slider) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Expiration Alert Reminders</Text>
        <Text style={styles.description}>Send background alerts when positions are nearing expiration.</Text>

        <View style={styles.sliderContainer}>
          <View style={styles.sliderTrack} />
          <View style={[styles.sliderFill, { width: `${(currentAlertIndex / 4) * 100}%` }]} />
          <View style={styles.nodesRow}>
            {alertValues.map((val, idx) => (
              <TouchableOpacity
                key={val}
                style={[styles.sliderNode, idx === currentAlertIndex && styles.sliderNodeSelected]}
                onPress={() => updateExpirationAlertThreshold(val)}
              />
            ))}
          </View>
        </View>
        <View style={styles.sliderLabels}>
          {alertLabels.map((label, idx) => (
            <Text
              key={label}
              style={[styles.sliderLabelText, idx === currentAlertIndex && styles.sliderLabelTextActive]}
              onPress={() => updateExpirationAlertThreshold(alertValues[idx])}
            >
              {label}
            </Text>
          ))}
        </View>
      </View>

      {/* 5. Data & Trade Exports Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data and Trade Exports</Text>

        <TouchableOpacity style={styles.linkRow} onPress={handleExportCSV}>
          <View style={styles.linkLeft}>
            <FileText size={18} color="#3B82F6" style={{ marginRight: 8 }} />
            <Text style={styles.linkLabel}>Export Portfolio (CSV Log)</Text>
          </View>
          <ArrowRight size={16} color="#4B5563" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={handleExportPDF}>
          <View style={styles.linkLeft}>
            <Printer size={18} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={styles.linkLabel}>Print Portfolio Report (PDF)</Text>
          </View>
          <ArrowRight size={16} color="#4B5563" />
        </TouchableOpacity>
      </View>

      {/* 6. Data Management Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Management</Text>

        <TouchableOpacity style={styles.linkRow} onPress={handleConfirmClearData}>
          <View style={styles.linkLeft}>
            <Trash2 size={18} color="#EF4444" style={{ marginRight: 8 }} />
            <Text style={[styles.linkLabel, { color: '#EF4444' }]}>Clear All Portfolio Data</Text>
          </View>
          <ArrowRight size={16} color="#4B5563" />
        </TouchableOpacity>
      </View>

      {/* 7. Support & Legal Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support & Legal</Text>

        <TouchableOpacity style={styles.linkRow} onPress={() => handleOpenLink('https://senthilmkm.github.io/coveredprofit-docs/support.html')}>
          <View style={styles.linkLeft}>
            <HelpCircle size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
            <Text style={styles.linkLabel}>Help & Support Center</Text>
          </View>
          <ArrowRight size={16} color="#4B5563" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => handleOpenLink('https://senthilmkm.github.io/coveredprofit-docs/terms.html')}>
          <View style={styles.linkLeft}>
            <FileText size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
            <Text style={styles.linkLabel}>Terms & Conditions</Text>
          </View>
          <ArrowRight size={16} color="#4B5563" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => handleOpenLink('https://senthilmkm.github.io/coveredprofit-docs/privacy.html')}>
          <View style={styles.linkLeft}>
            <Shield size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
            <Text style={styles.linkLabel}>Privacy Policy</Text>
          </View>
          <ArrowRight size={16} color="#4B5563" />
        </TouchableOpacity>
      </View>

      {/* Version Details */}
      <Text style={styles.versionText}>CashSecuredProfit v1.0.0 (Expo SDK 57)</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  premiumBanner: {
    backgroundColor: '#161C2D',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  premiumTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 2,
  },
  premiumDesc: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 16,
    paddingRight: 8,
  },
  premiumBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  premiumBtnText: {
    color: '#0B0F19',
    fontSize: 12,
    fontWeight: '800',
  },
  section: {
    backgroundColor: '#161C2D',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3B82F6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  description: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 16,
    marginBottom: 10,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  linkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkLabel: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 11,
    color: '#64748B',
    marginTop: 10,
    marginBottom: 30,
  },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 10,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  faqQuestion: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
    flex: 1,
    paddingRight: 10,
  },
  faqAnswer: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 16,
    marginTop: 6,
  },
  sliderContainer: {
    height: 30,
    justifyContent: 'center',
    marginVertical: 12,
    position: 'relative',
    paddingHorizontal: 10,
  },
  sliderTrack: {
    height: 6,
    backgroundColor: '#1F2937',
    borderRadius: 3,
    position: 'absolute',
    left: 10,
    right: 10,
  },
  sliderFill: {
    height: 6,
    backgroundColor: '#10B981',
    borderRadius: 3,
    position: 'absolute',
    left: 10,
  },
  nodesRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderNode: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#374151',
  },
  sliderNodeSelected: {
    borderColor: '#10B981',
    backgroundColor: '#10B981',
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sliderLabelText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
    width: 60,
  },
  sliderLabelTextActive: {
    color: '#10B981',
    fontWeight: '800',
  },
});