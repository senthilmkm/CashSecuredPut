import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Target,
} from 'lucide-react-native';
import { calculateCSPMetrics, CSPTradeMetrics } from '../services/cspMath';
import { getMarketQuote, getPutOptionChain, CSPOptionContract } from '../services/publicApi';
import PayoffChart from '../components/PayoffChart';

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
  const [selectedExpFilter, setSelectedExpFilter] = useState<string>('all');
  const [metrics, setMetrics] = useState<CSPTradeMetrics | null>(null);

  const quoteRequestId = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Extract unique sorted expiration dates
  const uniqueExpirations = useMemo(() => {
    return Array.from(new Set(optionChain.map((c) => c.expiration))).sort();
  }, [optionChain]);

  // Filter option chain by selected expiration date
  const displayedContracts = useMemo(() => {
    if (selectedExpFilter === 'all') return optionChain;
    return optionChain.filter((c) => c.expiration === selectedExpFilter);
  }, [optionChain, selectedExpFilter]);

  const handleSelectExpFilter = (exp: string) => {
    setSelectedExpFilter(exp);
    if (exp !== 'all') {
      const expTime = new Date(exp + 'T16:00:00Z').getTime();
      const days = Math.max(1, Math.round((expTime - Date.now()) / (1000 * 60 * 60 * 24)));
      setDte(days.toString());
    }
  };

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

    const reqId = ++quoteRequestId.current;
    setFetchingQuote(true);
    try {
      const quote = await getMarketQuote(cleanSymbol);
      if (reqId !== quoteRequestId.current || !isMountedRef.current) return;
      setStockPrice(quote.price.toFixed(2));
      
      const targetStrike = Math.round(quote.price * 0.95);
      setStrikePrice(targetStrike.toFixed(2));

      const currentDte = parseInt(dte, 10) || 30;
      const chain = await getPutOptionChain(cleanSymbol, quote.price, currentDte);
      if (reqId !== quoteRequestId.current || !isMountedRef.current) return;
      setOptionChain(chain);

      if (chain.length > 0) {
        // Pick best matching expiration date to current target DTE
        const uniqueExps = Array.from(new Set(chain.map((c) => c.expiration))).sort();
        let bestExp = uniqueExps[0];
        let minExpDiff = Infinity;
        for (const exp of uniqueExps) {
          const expTime = new Date(`${exp}T16:00:00Z`).getTime();
          const days = Math.max(1, Math.round((expTime - Date.now()) / (1000 * 60 * 60 * 24)));
          const diff = Math.abs(days - currentDte);
          if (diff < minExpDiff) {
            minExpDiff = diff;
            bestExp = exp;
          }
        }
        setSelectedExpFilter(bestExp);

        const expContracts = chain.filter((c) => c.expiration === bestExp);
        const candidateList = expContracts.length > 0 ? expContracts : chain;
        const nearest = candidateList.reduce((prev, curr) =>
          Math.abs(curr.strike - targetStrike) < Math.abs(prev.strike - targetStrike) ? curr : prev
        );
        if (nearest) {
          setSelectedContract(nearest);
          setStrikePrice(nearest.strike.toFixed(2));
          setPremium(nearest.premium.toFixed(2));
          if (nearest.expiration) {
            const expTime = new Date(nearest.expiration + 'T16:00:00Z').getTime();
            const nowTime = Date.now();
            const days = Math.max(1, Math.round((expTime - nowTime) / (1000 * 60 * 60 * 24)));
            setDte(days.toString());
          }
        }
      }
    } catch (error) {
      // Fallback allowed
    } finally {
      if (reqId === quoteRequestId.current && isMountedRef.current) {
        setFetchingQuote(false);
      }
    }
  };

  const handleDteChange = (text: string) => {
    setDte(text);
    const parsed = parseInt(text, 10);
    if (!isNaN(parsed) && parsed > 0 && uniqueExpirations.length > 0) {
      let closestExp = uniqueExpirations[0];
      let minDiff = Infinity;
      for (const exp of uniqueExpirations) {
        const expTime = new Date(`${exp}T16:00:00Z`).getTime();
        const days = Math.max(1, Math.round((expTime - Date.now()) / (1000 * 60 * 60 * 24)));
        const diff = Math.abs(days - parsed);
        if (diff < minDiff) {
          minDiff = diff;
          closestExp = exp;
        }
      }
      if (closestExp) {
        setSelectedExpFilter(closestExp);
      }
    }
  };

  const selectContractFromChain = (contract: CSPOptionContract) => {
    setSelectedContract(contract);
    setStrikePrice(contract.strike.toFixed(2));
    setPremium(contract.premium.toFixed(2));
    if (contract.expiration) {
      const expTime = new Date(contract.expiration + 'T16:00:00Z').getTime();
      const nowTime = Date.now();
      const days = Math.max(1, Math.round((expTime - nowTime) / (1000 * 60 * 60 * 24)));
      setDte(days.toString());
    }
  };

  const handleSavePosition = async () => {
    if (!metrics || metrics.collateralRequired === 0) {
      Alert.alert('Invalid Trade', 'Please enter valid stock price, strike, and premium before saving.');
      return;
    }

    const sStrike = parseFloat(strikePrice);
    const exactExpiration = (selectedContract && selectedContract.strike === sStrike && selectedContract.expiration)
      ? selectedContract.expiration
      : new Date(Date.now() + (parseInt(dte, 10) || 30) * 86400000).toISOString().split('T')[0];

    const tradeData = {
      ticker: ticker.trim().toUpperCase(),
      stockPrice: parseFloat(stockPrice),
      strikePrice: sStrike,
      premium: parseFloat(premium),
      contracts: parseInt(contracts, 10) || 1,
      dte: parseInt(dte, 10) || 30,
      expirationDate: exactExpiration,
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
        
        {/* 1. HERO SCORECARD & HEALTH GAUGE CARD */}
        {metrics && (
          <View style={styles.scoreCard}>
            <View style={styles.scoreHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                  <Text style={styles.scoreTitle}>{ticker} CSP Health Scorecard</Text>
                  <View style={[styles.scoreBadge, { backgroundColor: getScoreColor(metrics.score) }]}>
                    <Text style={styles.scoreBadgeText}>{metrics.score}/100</Text>
                  </View>
                </View>
                <Text style={styles.recTitleText}>{metrics.recommendationTitle}</Text>
              </View>
            </View>

            {/* 4-Card Metrics Grid */}
            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel} numberOfLines={1}>Collateral</Text>
                <Text style={styles.metricValuePrimary} numberOfLines={1} adjustsFontSizeToFit>${metrics.collateralRequired.toLocaleString()}</Text>
                <Text style={styles.metricSub} numberOfLines={1}>{parsedContracts * 100} shares</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel} numberOfLines={1}>Net Income</Text>
                <Text style={styles.metricValueSuccess} numberOfLines={1} adjustsFontSizeToFit>+${metrics.netPremium.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</Text>
                <Text style={styles.metricSub} numberOfLines={1}>ROC: {metrics.returnOnCapitalPercent}%</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel} numberOfLines={1}>Annual APR</Text>
                <Text style={styles.metricValuePrimary} numberOfLines={1} adjustsFontSizeToFit>{metrics.annualizedApr}%</Text>
                <Text style={styles.metricSub} numberOfLines={1}>APY: {metrics.annualizedApy}%</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel} numberOfLines={1}>Cost Basis</Text>
                <Text style={styles.metricValueSuccess} numberOfLines={1} adjustsFontSizeToFit>${metrics.effectiveCostBasis.toFixed(2)}</Text>
                <Text style={styles.metricSub} numberOfLines={1}>{metrics.effectiveDiscountPercent}% discount</Text>
              </View>
            </View>

            {/* Delta & Probability of Profit Banner */}
            {metrics.greeks && (
              <View style={styles.greeksBar}>
                <View style={styles.greekItem}>
                  <Text style={styles.greekLabel}>Delta</Text>
                  <Text style={styles.greekVal}>{metrics.greeks.delta}</Text>
                </View>

                <View style={styles.greekDivider} />

                <View style={styles.greekItem}>
                  <Text style={styles.greekLabel}>Prob of Profit (POP)</Text>
                  <Text style={styles.greekValSuccess}>{metrics.greeks.probabilityOfProfit}%</Text>
                </View>

                <View style={styles.greekDivider} />

                <View style={styles.greekItem}>
                  <Text style={styles.greekLabel}>Prob Assignment</Text>
                  <Text style={metrics.greeks.probabilityAssignment > 30 ? styles.greekValDanger : styles.greekVal}>{metrics.greeks.probabilityAssignment}%</Text>
                </View>

                <View style={styles.greekDivider} />

                <View style={styles.greekItem}>
                  <Text style={styles.greekLabel}>Time Decay ($\theta$)</Text>
                  <Text style={styles.greekVal}>+${(metrics.greeks.thetaPerDay * parsedContracts * 100).toFixed(2)}/day</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* 1.5 INTERACTIVE EXPIRATION PAYOFF CHART */}
        {metrics && (
          <PayoffChart
            stockPrice={parseFloat(stockPrice) || 0}
            strikePrice={parseFloat(strikePrice) || 0}
            premium={parseFloat(premium) || 0}
            contracts={parsedContracts}
          />
        )}

        {/* 2. SEARCH & PARAMETERS CARD */}
        <View style={styles.formCard}>
          <Text style={styles.cardSectionTitle}>Search & Trade Parameters</Text>
          
          <View style={styles.searchRow}>
            <View style={styles.tickerBox}>
              <Search color="#94A3B8" size={16} style={{ marginRight: 6 }} />
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
                <Text style={styles.fetchBtnText}>Fetch Quote</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Form Matrix */}
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
              <TextInput style={styles.mInput} value={dte} onChangeText={handleDteChange} keyboardType="number-pad" />
            </View>
          </View>

          {/* Dynamic Helper Bar */}
          <View style={styles.helperBar}>
            <Text style={styles.helperBarText}>
              Total Net Premium Collected: <Text style={{ color: '#10B981', fontWeight: '800' }}>+${totalCashCollected.toFixed(2)}</Text> ({parsedContracts * 100} shares locked)
            </Text>
          </View>
        </View>

        {/* 3. LIVE OPTIONS CHAIN CARD */}
        <View style={styles.chainCard}>
          <View style={styles.chainHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.cardSectionTitle}>Live Options Chain (Puts)</Text>
              {optionChain.length > 0 && (
                <View style={styles.liveBadge}>
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              )}
            </View>
            {!isPremium && (
              <TouchableOpacity onPress={onOpenPaywall} activeOpacity={0.8}>
                <View style={styles.proTag}>
                  <Crown color="#F59E0B" size={11} style={{ marginRight: 3 }} />
                  <Text style={styles.proTagText}>PRO</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {isPremium ? (
            optionChain.length > 0 ? (
              <View>
                {/* Expiration Date Pill Filters */}
                {uniqueExpirations.length > 1 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.expPillsScroll}
                    contentContainerStyle={styles.expPillsContent}
                  >
                    <TouchableOpacity
                      style={[styles.expPill, selectedExpFilter === 'all' && styles.expPillActive]}
                      onPress={() => handleSelectExpFilter('all')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.expPillText, selectedExpFilter === 'all' && styles.expPillTextActive]}>
                        All ({optionChain.length})
                      </Text>
                    </TouchableOpacity>
                    {uniqueExpirations.map((exp) => {
                      const expTime = new Date(exp + 'T16:00:00Z').getTime();
                      const days = Math.max(1, Math.round((expTime - Date.now()) / (1000 * 60 * 60 * 24)));
                      const isSelected = selectedExpFilter === exp;
                      return (
                        <TouchableOpacity
                          key={exp}
                          style={[styles.expPill, isSelected && styles.expPillActive]}
                          onPress={() => handleSelectExpFilter(exp)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.expPillText, isSelected && styles.expPillTextActive]}>
                            {exp} ({days}d)
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                <View style={{ maxHeight: 220 }}>
                  <View style={styles.chainColHeaders}>
                    <Text style={[styles.chainColHeader, { flex: 1.1 }]}>STRIKE</Text>
                    <Text style={[styles.chainColHeader, { flex: 1.1, textAlign: 'center' }]}>EXPIRATION</Text>
                    <Text style={[styles.chainColHeader, { flex: 1.4, textAlign: 'right' }]}>PREM / SHARE</Text>
                  </View>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {displayedContracts.map((contract: CSPOptionContract, idx: number) => {
                      const isSelected = selectedContract
                        ? (selectedContract.symbol === contract.symbol || (selectedContract.strike === contract.strike && selectedContract.expiration === contract.expiration))
                        : strikePrice === contract.strike.toFixed(2);
                      return (
                        <TouchableOpacity
                          key={contract.symbol || idx}
                          style={[styles.chainRow, isSelected && styles.chainRowSelected]}
                          onPress={() => selectContractFromChain(contract)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.chainStrike}>${contract.strike.toFixed(2)} Put</Text>
                          <Text style={styles.chainExp}>{contract.expiration}</Text>
                          <View style={styles.chainPremCol}>
                            <Text style={styles.chainPrem}>+${contract.premium.toFixed(2)}/sh</Text>
                            <Text style={styles.chainPremTotal}>(${(contract.premium * 100).toFixed(0)}/cnt)</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            ) : (
              <ActivityIndicator color="#10B981" style={{ margin: 12 }} />
            )
          ) : (
            <TouchableOpacity style={styles.paywallOverlay} onPress={onOpenPaywall} activeOpacity={0.85}>
              <Sparkles size={20} color="#F59E0B" style={{ marginRight: 8 }} />
              <Text style={styles.paywallText}>Unlock Live Option Chains & 1-Tap Auto-fill</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 4. ACTION BUTTONS */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity style={styles.saveTradeBtn} onPress={handleSavePosition} activeOpacity={0.85}>
            <LinearGradient colors={['#10B981', '#059669']} style={styles.btnGradient}>
              <Plus color="#FFF" size={18} style={{ marginRight: 6 }} />
              <Text style={styles.btnText}>Save Position</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.rollSimBtn}
            onPress={() => onOpenRollSim({
              ticker: ticker.trim().toUpperCase(),
              stockPrice: parseFloat(stockPrice) || 0,
              strikePrice: parseFloat(strikePrice) || 0,
              premium: parseFloat(premium) || 0,
              contracts: parsedContracts,
              dte: parseInt(dte, 10) || 30,
            })}
            activeOpacity={0.85}
          >
            <RefreshCw color="#3B82F6" size={18} style={{ marginRight: 6 }} />
            <Text style={styles.rollBtnText}>Roll Simulator</Text>
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
    padding: 14,
    paddingBottom: 32,
  },
  scoreCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  scoreTitle: {
    fontSize: 16.5,
    fontWeight: '900',
    color: '#F8FAFC',
    marginRight: 8,
  },
  scoreBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  scoreBadgeText: {
    color: '#FFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  recTitleText: {
    color: '#94A3B8',
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricCard: {
    width: '23.5%',
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  metricLabel: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 3,
    fontWeight: '600',
    textAlign: 'center',
  },
  metricValuePrimary: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#3B82F6',
    textAlign: 'center',
  },
  metricValueSuccess: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#10B981',
    textAlign: 'center',
  },
  metricSub: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 1,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardSectionTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 9,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 11,
  },
  tickerBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderRadius: 9,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 8,
    height: 40,
  },
  tickerInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 15.5,
    fontWeight: '700',
  },
  fetchBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 9,
    height: 40,
    paddingHorizontal: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fetchBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13.5,
  },
  formMatrix: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mCol: {
    width: '18.5%',
  },
  mLabel: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginBottom: 4,
    fontWeight: '600',
  },
  mInput: {
    backgroundColor: '#0B0F19',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#F8FAFC',
    paddingHorizontal: 6,
    height: 40,
    fontSize: 14.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  helperBar: {
    marginTop: 10,
    backgroundColor: '#0B0F19',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 9,
  },
  helperBarText: {
    fontSize: 11.5,
    color: '#94A3B8',
    textAlign: 'center',
  },
  chainCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  chainHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  proTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#451A03',
    paddingHorizontal: 7.5,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  proTagText: {
    color: '#F59E0B',
    fontSize: 10.5,
    fontWeight: '800',
  },
  chainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 13,
    marginBottom: 7,
  },
  chainRowSelected: {
    borderColor: '#10B981',
    backgroundColor: '#0F291E',
  },
  chainColHeaders: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 6,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  chainColHeader: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  chainStrike: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  chainExp: {
    color: '#94A3B8',
    fontSize: 12,
  },
  chainPremCol: {
    alignItems: 'flex-end',
  },
  chainPrem: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '800',
  },
  chainPremTotal: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '600',
  },
  liveBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    marginLeft: 7,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  liveBadgeText: {
    color: '#10B981',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  expPillsScroll: {
    marginBottom: 10,
  },
  expPillsContent: {
    paddingVertical: 2,
  },
  expPill: {
    backgroundColor: '#0B0F19',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 8,
    marginRight: 7,
  },
  expPillActive: {
    backgroundColor: '#0F291E',
    borderColor: '#10B981',
  },
  expPillText: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  expPillTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  paywallOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0F19',
    borderRadius: 9,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  paywallText: {
    color: '#F59E0B',
    fontSize: 12.5,
    fontWeight: '700',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  saveTradeBtn: {
    flex: 0.58,
    borderRadius: 11,
    overflow: 'hidden',
  },
  btnGradient: {
    paddingVertical: 12.5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 15.5,
  },
  rollSimBtn: {
    flex: 0.38,
    backgroundColor: '#0F172A',
    borderRadius: 11,
    paddingVertical: 12.5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E3A8A',
  },
  rollBtnText: {
    color: '#3B82F6',
    fontWeight: '700',
    fontSize: 14.5,
  },
  greeksBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  greekItem: {
    flex: 1,
    alignItems: 'center',
  },
  greekLabel: {
    fontSize: 9.5,
    color: '#64748B',
    marginBottom: 2,
    fontWeight: '600',
  },
  greekVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  greekValSuccess: {
    fontSize: 12,
    fontWeight: '800',
    color: '#10B981',
  },
  greekValDanger: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EF4444',
  },
  greekDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#1E293B',
  },
});