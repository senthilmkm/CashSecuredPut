import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Search,
  Plus,
  Crown,
  RefreshCw,
  Sparkles,
} from 'lucide-react-native';
import { calculateCSPMetrics, CSPTradeMetrics } from '../services/cspMath';
import { getMarketQuote, getPutOptionChain, CSPOptionContract } from '../services/publicApi';

interface CalculatorProps {
  onSaveTrade: (tradeData: any) => Promise<{ success: boolean; paywallTriggered?: boolean }>;
  onOpenRollSim: (tradeData: any) => void;
  onOpenPaywall: () => void;
  isPremium: boolean;
  savedTradesCount: number;
}

export default function Calculator({
  onSaveTrade,
  onOpenRollSim,
  onOpenPaywall,
  isPremium,
  savedTradesCount,
}: CalculatorProps) {
  const [ticker, setTicker] = useState('AAPL');
  const [stockPrice, setStockPrice] = useState('220.50');
  const [strikePrice, setStrikePrice] = useState('210.00');
  const [premium, setPremium] = useState('3.80');
  const [contracts, setContracts] = useState('1');
  const [dte, setDte] = useState('30');
  const [commissions, setCommissions] = useState('1.00');

  const [fetchingQuote, setFetchingQuote] = useState(false);
  const [optionChain, setOptionChain] = useState<CSPOptionContract[]>([]);
  const [selectedContract, setSelectedContract] = useState<CSPOptionContract | null>(null);
  const [metrics, setMetrics] = useState<CSPTradeMetrics | null>(null);

  // Re-calculate metrics whenever inputs change
  useEffect(() => {
    const sPrice = parseFloat(stockPrice) || 0;
    const strike = parseFloat(strikePrice) || 0;
    const prem = parseFloat(premium) || 0;
    const cnt = parseInt(contracts, 10) || 1;
    const days = parseInt(dte, 10) || 1;
    const comm = parseFloat(commissions) || 0;

    const res = calculateCSPMetrics({
      stockPrice: sPrice,
      strikePrice: strike,
      premium: prem,
      contracts: cnt,
      dte: days,
      commissions: comm,
    });

    setMetrics(res);
  }, [stockPrice, strikePrice, premium, contracts, dte, commissions]);

  // Initial quote fetch on mount
  useEffect(() => {
    handleFetchQuote();
  }, []);

  const handleFetchQuote = async () => {
    const cleanSymbol = ticker.trim().toUpperCase();
    if (!cleanSymbol) {
      Alert.alert('Invalid Ticker', 'Please enter a valid stock symbol (e.g. AAPL, TSLA, NVDA).');
      return;
    }

    setFetchingQuote(true);
    try {
      const quote = await getMarketQuote(cleanSymbol);
      setStockPrice(quote.price.toFixed(2));
      
      const targetStrike = Math.round(quote.price * 0.95);
      setStrikePrice(targetStrike.toFixed(2));

      const chain = await getPutOptionChain(cleanSymbol, quote.price);
      setOptionChain(chain);

      if (chain.length > 0) {
        const nearest = chain.reduce((prev, curr) =>
          Math.abs(curr.strike - targetStrike) < Math.abs(prev.strike - targetStrike) ? curr : prev
        );
        if (nearest) {
          setSelectedContract(nearest);
          setStrikePrice(nearest.strike.toFixed(2));
          setPremium(nearest.premium.toFixed(2));
        }
      }
    } catch (error) {
      // Fallback allowed
    } finally {
      setFetchingQuote(false);
    }
  };

  const selectContractFromChain = (contract: CSPOptionContract) => {
    setSelectedContract(contract);
    setStrikePrice(contract.strike.toFixed(2));
    setPremium(contract.premium.toFixed(2));
  };

  const handleSavePosition = async () => {
    if (!metrics || metrics.collateralRequired === 0) {
      Alert.alert('Invalid Trade', 'Please enter valid stock price, strike, and premium before saving.');
      return;
    }

    const tradeData = {
      ticker: ticker.trim().toUpperCase(),
      stockPrice: parseFloat(stockPrice),
      strikePrice: parseFloat(strikePrice),
      premium: parseFloat(premium),
      contracts: parseInt(contracts, 10),
      dte: parseInt(dte, 10),
      expirationDate: new Date(Date.now() + (parseInt(dte, 10) || 30) * 86400000).toISOString().split('T')[0],
      commissions: parseFloat(commissions) || 0,
    };

    const result = await onSaveTrade(tradeData);
    if (result.paywallTriggered) {
      onOpenPaywall();
    } else if (result.success) {
      Alert.alert('Trade Saved!', `${tradeData.ticker} Put option saved to your portfolio.`);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return '#10B981';
    if (score >= 40) return '#F59E0B';
    return '#EF4444';
  };

  const parsedContracts = Math.max(1, parseInt(contracts, 10) || 1);
  const parsedPremium = Math.max(0, parseFloat(premium) || 0);
  const parsedCommissions = Math.max(0, parseFloat(commissions) || 0);
  const totalCashCollected = Math.max(0, parsedPremium * 100 * parsedContracts - parsedCommissions);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* 1. COMPACT HERO SCORECARD & METRICS ROW */}
        {metrics && (
          <View style={styles.compactScoreCard}>
            <View style={styles.scoreTopRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.scoreTitle}>{ticker} CSP Scorecard</Text>
                  <View style={[styles.miniScoreBadge, { backgroundColor: getScoreColor(metrics.score) }]}>
                    <Text style={styles.miniScoreBadgeText}>{metrics.score}/100</Text>
                  </View>
                </View>
                <Text style={styles.recTitleText} numberOfLines={1}>{metrics.recommendationTitle}</Text>
              </View>
            </View>

            {/* Compact 4-Card Grid */}
            <View style={styles.compactGrid}>
              <View style={styles.compactMetricItem}>
                <Text style={styles.cMetricLabel}>Collateral</Text>
                <Text style={styles.cMetricValuePrimary}>${metrics.collateralRequired.toLocaleString()}</Text>
                <Text style={styles.cMetricSub}>{parsedContracts * 100} sh</Text>
              </View>

              <View style={styles.compactMetricItem}>
                <Text style={styles.cMetricLabel}>Net Income</Text>
                <Text style={styles.cMetricValueSuccess}>+${metrics.netPremium.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</Text>
                <Text style={styles.cMetricSub}>ROC: {metrics.returnOnCapitalPercent}%</Text>
              </View>

              <View style={styles.compactMetricItem}>
                <Text style={styles.cMetricLabel}>APR / APY</Text>
                <Text style={styles.cMetricValuePrimary}>{metrics.annualizedApr}%</Text>
                <Text style={styles.cMetricSub}>APY: {metrics.annualizedApy}%</Text>
              </View>

              <View style={styles.compactMetricItem}>
                <Text style={styles.cMetricLabel}>Cost Basis</Text>
                <Text style={styles.cMetricValueSuccess}>${metrics.effectiveCostBasis.toFixed(2)}</Text>
                <Text style={styles.cMetricSub}>{metrics.effectiveDiscountPercent}% off</Text>
              </View>
            </View>
          </View>
        )}

        {/* 2. COMPACT SEARCH & FORM PARAMETERS CARD */}
        <View style={styles.compactFormCard}>
          <View style={styles.searchRow}>
            <View style={styles.tickerBox}>
              <Search color="#94A3B8" size={14} style={{ marginRight: 4 }} />
              <TextInput
                style={styles.tickerInput}
                value={ticker}
                onChangeText={(t: string) => setTicker(t.toUpperCase())}
                placeholder="SYMBOL"
                placeholderTextColor="#64748B"
                autoCapitalize="characters"
              />
            </View>
            <TouchableOpacity style={styles.fetchBtn} onPress={handleFetchQuote} disabled={fetchingQuote}>
              {fetchingQuote ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.fetchBtnText}>Quote</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Compact Input Matrix */}
          <View style={styles.formMatrix}>
            <View style={styles.mCol}>
              <Text style={styles.mLabel}>Stock ($)</Text>
              <TextInput style={styles.mInput} value={stockPrice} onChangeText={setStockPrice} keyboardType="numeric" />
            </View>

            <View style={styles.mCol}>
              <Text style={styles.mLabel}>Strike ($)</Text>
              <TextInput style={styles.mInput} value={strikePrice} onChangeText={setStrikePrice} keyboardType="numeric" />
            </View>

            <View style={styles.mCol}>
              <Text style={styles.mLabel}>Prem ($)</Text>
              <TextInput style={styles.mInput} value={premium} onChangeText={setPremium} keyboardType="numeric" />
            </View>

            <View style={styles.mCol}>
              <Text style={styles.mLabel}>Cnts</Text>
              <TextInput style={styles.mInput} value={contracts} onChangeText={setContracts} keyboardType="number-pad" />
            </View>

            <View style={styles.mCol}>
              <Text style={styles.mLabel}>DTE</Text>
              <TextInput style={styles.mInput} value={dte} onChangeText={setDte} keyboardType="number-pad" />
            </View>
          </View>

          {/* Quick Net Income Helper Bar */}
          <View style={styles.helperBar}>
            <Text style={styles.helperBarText}>
              Total Cash Collected: <Text style={{ color: '#10B981', fontWeight: '800' }}>+${totalCashCollected.toFixed(2)}</Text> ({parsedContracts * 100} shares)
            </Text>
          </View>
        </View>

        {/* 3. COMPACT LIVE OPTIONS CHAIN LIST */}
        <View style={styles.compactChainCard}>
          <View style={styles.chainHeaderRow}>
            <Text style={styles.sectionTitle}>Put Option Chain</Text>
            {!isPremium && (
              <View style={styles.proTag}>
                <Crown color="#F59E0B" size={10} style={{ marginRight: 2 }} />
                <Text style={styles.proTagText}>PRO</Text>
              </View>
            )}
          </View>

          {isPremium ? (
            optionChain.length > 0 ? (
              <View style={{ maxHeight: 150 }}>
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {optionChain.map((contract: CSPOptionContract, idx: number) => {
                    const isSelected = selectedContract?.symbol === contract.symbol || strikePrice === contract.strike.toFixed(2);
                    return (
                      <TouchableOpacity
                        key={contract.symbol || idx}
                        style={[styles.miniChainRow, isSelected && styles.miniChainRowSelected]}
                        onPress={() => selectContractFromChain(contract)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.mChainStrike}>${contract.strike.toFixed(2)} Put</Text>
                        <Text style={styles.mChainExp}>{contract.expiration}</Text>
                        <Text style={styles.mChainPrem}>+${contract.premium.toFixed(2)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <ActivityIndicator color="#10B981" style={{ margin: 10 }} />
            )
          ) : (
            <TouchableOpacity style={styles.compactPaywallOverlay} onPress={onOpenPaywall} activeOpacity={0.85}>
              <Sparkles size={18} color="#F59E0B" style={{ marginRight: 6 }} />
              <Text style={styles.compactPaywallText}>Unlock Live Option Chains & 1-Tap Auto-fill</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 4. COMPACT ACTION BUTTONS */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity style={styles.saveTradeBtn} onPress={handleSavePosition} activeOpacity={0.85}>
            <LinearGradient colors={['#10B981', '#059669']} style={styles.btnGradient}>
              <Plus color="#FFF" size={16} style={{ marginRight: 4 }} />
              <Text style={styles.btnText}>Save Position</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.rollSimBtn}
            onPress={() => onOpenRollSim(metrics)}
            activeOpacity={0.85}
          >
            <RefreshCw color="#3B82F6" size={16} style={{ marginRight: 4 }} />
            <Text style={styles.rollBtnText}>Roll Sim</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  scrollContent: {
    padding: 10,
    paddingBottom: 20,
  },
  compactScoreCard: {
    backgroundColor: '#161E2E',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  scoreTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scoreTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#F8FAFC',
    marginRight: 8,
  },
  miniScoreBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniScoreBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  recTitleText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  compactGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  compactMetricItem: {
    width: '23.5%',
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cMetricLabel: {
    fontSize: 9,
    color: '#64748B',
    marginBottom: 1,
  },
  cMetricValuePrimary: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3B82F6',
  },
  cMetricValueSuccess: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
  },
  cMetricSub: {
    fontSize: 8,
    color: '#94A3B8',
  },
  compactFormCard: {
    backgroundColor: '#161E2E',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tickerBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 8,
    height: 36,
  },
  tickerInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  fetchBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    height: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fetchBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  formMatrix: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mCol: {
    width: '18.5%',
  },
  mLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 3,
    fontWeight: '600',
  },
  mInput: {
    backgroundColor: '#0B0F19',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#F8FAFC',
    paddingHorizontal: 6,
    height: 34,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  helperBar: {
    marginTop: 8,
    backgroundColor: '#0B0F19',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  helperBarText: {
    fontSize: 10,
    color: '#94A3B8',
    textAlign: 'center',
  },
  compactChainCard: {
    backgroundColor: '#161E2E',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  chainHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  proTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#451A03',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proTagText: {
    color: '#F59E0B',
    fontSize: 9,
    fontWeight: '800',
  },
  miniChainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  miniChainRowSelected: {
    borderColor: '#10B981',
    backgroundColor: '#0F291E',
  },
  mChainStrike: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  mChainExp: {
    color: '#94A3B8',
    fontSize: 11,
  },
  mChainPrem: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '800',
  },
  compactPaywallOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  compactPaywallText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  saveTradeBtn: {
    flex: 0.58,
    borderRadius: 10,
    overflow: 'hidden',
  },
  btnGradient: {
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 14,
  },
  rollSimBtn: {
    flex: 0.38,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E3A8A',
  },
  rollBtnText: {
    color: '#3B82F6',
    fontWeight: '700',
    fontSize: 13,
  },
});