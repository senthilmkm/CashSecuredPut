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
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Search,
  Plus,
  Crown,
  RefreshCw,
  Sparkles,
  Target,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Calendar,
} from 'lucide-react-native';
import { calculateCSPMetrics, CSPTradeMetrics } from '../services/cspMath';
import { getMarketQuote, getPutOptionChain, CSPOptionContract } from '../services/publicApi';
import { checkEarningsRisk, EarningsRiskResult } from '../services/earningsService';
import { getMarketSessionStatus } from '../services/marketHours';
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
  const [customIv, setCustomIv] = useState('');

  const [fetchingQuote, setFetchingQuote] = useState(false);
  const [isSyncingDte, setIsSyncingDte] = useState(false);
  const [isSimulatedData, setIsSimulatedData] = useState(false);
  const [earningsRisk, setEarningsRisk] = useState<EarningsRiskResult>({ hasEarningsRisk: false });
  const [showAdvancedChart, setShowAdvancedChart] = useState(false);
  const [optionChain, setOptionChain] = useState<CSPOptionContract[]>([]);
  const [selectedContract, setSelectedContract] = useState<CSPOptionContract | null>(null);
  const [selectedExpFilter, setSelectedExpFilter] = useState<string>('all');
  const [metrics, setMetrics] = useState<CSPTradeMetrics | null>(null);
  const [marketStatusTimestamp, setMarketStatusTimestamp] = useState<number>(Date.now());
  const marketStatus = useMemo(() => getMarketSessionStatus(), [marketStatusTimestamp]);

  const quoteRequestId = useRef(0);

  const isMountedRef = useRef(true);
  const dteTimeoutRef = useRef<any>(null);

  // Auto-scroll refs & layout measurements for Live Options Chain & Expiration Filters
  const expPillsScrollRef = useRef<ScrollView>(null);
  const expPillsContainerWidthRef = useRef<number>(350);
  const expPillLayoutsRef = useRef<{ [key: string]: { x: number; width: number } }>({});

  const chainScrollRef = useRef<ScrollView>(null);
  const chainContainerHeightRef = useRef<number>(220);
  const chainRowLayoutsRef = useRef<{ [key: string]: { y: number; height: number } }>({});

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (dteTimeoutRef.current) clearTimeout(dteTimeoutRef.current);
    };
  }, []);

  // Smoothly center the active expiration date filter pill in front of user's eyes
  const scrollToExpPill = (expKey: string) => {
    requestAnimationFrame(() => {
      const layout = expPillLayoutsRef.current[expKey];
      if (layout && expPillsScrollRef.current) {
        const containerWidth = expPillsContainerWidthRef.current || 350;
        const targetX = Math.max(0, layout.x - (containerWidth / 2) + (layout.width / 2));
        expPillsScrollRef.current.scrollTo({ x: targetX, animated: true });
      }
    });
  };

  // Smoothly center the active put contract row in the options chain table
  const scrollToSelectedRow = (rowKey?: string) => {
    requestAnimationFrame(() => {
      const key = rowKey || (selectedContract ? `${selectedContract.strike}_${selectedContract.expiration}` : undefined);
      if (!key) return;
      const layout = chainRowLayoutsRef.current[key];
      if (layout && chainScrollRef.current) {
        const containerHeight = chainContainerHeightRef.current || 220;
        const targetY = Math.max(0, layout.y - (containerHeight / 2) + (layout.height / 2));
        chainScrollRef.current.scrollTo({ y: targetY, animated: true });
      }
    });
  };

  // Extract unique sorted expiration dates
  const uniqueExpirations = useMemo(() => {
    return Array.from(new Set(optionChain.map((c) => c.expiration))).sort();
  }, [optionChain]);

  // Filter option chain by selected expiration date
  const displayedContracts = useMemo(() => {
    // Clear layout cache when contracts change so new positions are cleanly measured
    chainRowLayoutsRef.current = {};
    if (selectedExpFilter === 'all') return optionChain;
    return optionChain.filter((c) => c.expiration === selectedExpFilter);
  }, [optionChain, selectedExpFilter]);

  // Auto-center the selected date filter pill whenever selectedExpFilter or uniqueExpirations update
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToExpPill(selectedExpFilter);
    }, 60);
    return () => clearTimeout(timer);
  }, [selectedExpFilter, uniqueExpirations]);

  // Auto-center the selected row in options chain whenever selectedContract, strike, or displayed contracts update
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedContract) {
        scrollToSelectedRow(`${selectedContract.strike}_${selectedContract.expiration}`);
      } else if (strikePrice && displayedContracts.length > 0) {
        const matched = displayedContracts.find((c) => c.strike.toFixed(2) === strikePrice);
        if (matched) {
          scrollToSelectedRow(`${matched.strike}_${matched.expiration}`);
        }
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [selectedContract, strikePrice, displayedContracts]);

  const handleSelectExpFilter = (exp: string) => {
    setSelectedExpFilter(exp);
    if (exp !== 'all') {
      const expTime = new Date(exp + 'T16:00:00Z').getTime();
      const days = Math.max(1, Math.round((expTime - Date.now()) / (1000 * 60 * 60 * 24)));
      setDte(days.toString());

      // Auto-select nearest 95% target strike within newly selected expiration
      const targetExpContracts = optionChain.filter((c) => c.expiration === exp);
      if (targetExpContracts.length > 0) {
        const sPrice = parseFloat(stockPrice) || 0;
        const targetStrike = sPrice > 0 ? Math.round(sPrice * 0.95) : 0;
        const nearest = targetExpContracts.reduce((prev, curr) =>
          Math.abs(curr.strike - targetStrike) < Math.abs(prev.strike - targetStrike) ? curr : prev
        );
        if (nearest) {
          setSelectedContract(nearest);
          setStrikePrice(nearest.strike.toFixed(2));
          setPremium(nearest.premium.toFixed(2));
          if (typeof nearest.impliedVolatility === 'number' && nearest.impliedVolatility > 0) {
            setCustomIv((nearest.impliedVolatility * 100).toFixed(1));
          }
        }
      }
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
    const parsedIv = parseFloat(customIv) > 0 ? parseFloat(customIv) / 100 : undefined;

    const res = calculateCSPMetrics({
      stockPrice: sPrice,
      strikePrice: strike,
      premium: prem,
      contracts: cnt,
      dte: days,
      commissions: comm,
      impliedVol: parsedIv,
      earningsDate: earningsRisk.hasEarningsRisk ? earningsRisk.earningsDate : undefined,
    });

    setMetrics(res);
  }, [stockPrice, strikePrice, premium, contracts, dte, commissions, customIv, earningsRisk]);

  // Initial quote fetch on mount
  useEffect(() => {
    handleFetchQuote();
  }, []);

  const handleFetchQuote = async (symbolOverride?: string) => {
    Keyboard.dismiss();
    const cleanSymbol = (typeof symbolOverride === 'string' ? symbolOverride : ticker).trim().toUpperCase();
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

      // Track whether live market data vs simulated mock was received
      const isMock = !!(quote?.isMocked || (chain.length > 0 && chain[0]?.isMocked));
      setIsSimulatedData(isMock);

      // Check earnings risk within this expiration timeframe
      const eRisk = checkEarningsRisk(cleanSymbol, currentDte);
      setEarningsRisk(eRisk);

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
          if (typeof nearest.impliedVolatility === 'number' && nearest.impliedVolatility > 0) {
            setCustomIv((nearest.impliedVolatility * 100).toFixed(1));
          }
          if (nearest.expiration) {
            const expTime = new Date(nearest.expiration + 'T16:00:00Z').getTime();
            const nowTime = Date.now();
            const days = Math.max(1, Math.round((expTime - nowTime) / (1000 * 60 * 60 * 24)));
            setDte(days.toString());
            const updatedRisk = checkEarningsRisk(cleanSymbol, days);
            setEarningsRisk(updatedRisk);
          }
        }
      }
    } catch (error) {
      setIsSimulatedData(true);
    } finally {
      if (reqId === quoteRequestId.current && isMountedRef.current) {
        setFetchingQuote(false);
      }
    }
  };

  const fetchChainForTargetDte = async (targetDteNum: number) => {
    const cleanSymbol = ticker.trim().toUpperCase();
    if (!cleanSymbol) {
      setIsSyncingDte(false);
      return;
    }

    const reqId = ++quoteRequestId.current;
    try {
      const stockNum = parseFloat(stockPrice) || 0;
      const targetQueryDte = Math.max(1, targetDteNum);
      const chain = await getPutOptionChain(cleanSymbol, stockNum, targetQueryDte);
      if (reqId !== quoteRequestId.current || !isMountedRef.current) return;

      setOptionChain(chain);
      if (chain.length > 0 && chain[0]?.isMocked) {
        setIsSimulatedData(true);
      }

      // Check earnings risk for new target DTE
      const eRisk = checkEarningsRisk(cleanSymbol, targetDteNum);
      setEarningsRisk(eRisk);

      if (chain.length > 0) {
        const uniqueExps = Array.from(new Set(chain.map((c) => c.expiration))).sort();
        let bestExp = uniqueExps[0];
        let minExpDiff = Infinity;
        for (const exp of uniqueExps) {
          const expTime = new Date(`${exp}T16:00:00Z`).getTime();
          const days = Math.max(1, Math.round((expTime - Date.now()) / (1000 * 60 * 60 * 24)));
          const diff = Math.abs(days - targetDteNum);
          if (diff < minExpDiff) {
            minExpDiff = diff;
            bestExp = exp;
          }
        }
        setSelectedExpFilter(bestExp);

        const expContracts = chain.filter((c) => c.expiration === bestExp);
        const candidateList = expContracts.length > 0 ? expContracts : chain;
        const targetStrike = stockNum > 0 ? Math.round(stockNum * 0.95) : 0;
        const nearest = candidateList.reduce((prev, curr) =>
          Math.abs(curr.strike - targetStrike) < Math.abs(prev.strike - targetStrike) ? curr : prev
        );
        if (nearest) {
          setSelectedContract(nearest);
          setStrikePrice(nearest.strike.toFixed(2));
          setPremium(nearest.premium.toFixed(2));
          if (typeof nearest.impliedVolatility === 'number' && nearest.impliedVolatility > 0) {
            setCustomIv((nearest.impliedVolatility * 100).toFixed(1));
          }
        }
      }
    } catch (e) {
      // Fallback
    } finally {
      // Display spinner for at least 1.5s so user clearly gets positive visual feedback
      setTimeout(() => {
        if (reqId === quoteRequestId.current && isMountedRef.current) {
          setIsSyncingDte(false);
        }
      }, 1500);
    }
  };

  const handleDteChange = (text: string) => {
    setDte(text);
    if (dteTimeoutRef.current) {
      clearTimeout(dteTimeoutRef.current);
    }

    const parsed = parseInt(text, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      setIsSyncingDte(true);
      dteTimeoutRef.current = setTimeout(() => {
        fetchChainForTargetDte(parsed);
      }, 500);
    } else {
      setIsSyncingDte(false);
    }
  };

  const handleSelectQuickTicker = (sym: string) => {
    Keyboard.dismiss();
    setTicker(sym);
    handleFetchQuote(sym);
  };

  const selectContractFromChain = (contract: CSPOptionContract) => {
    Keyboard.dismiss();
    setSelectedContract(contract);
    setStrikePrice(contract.strike.toFixed(2));
    setPremium(contract.premium.toFixed(2));
    if (typeof contract.impliedVolatility === 'number' && contract.impliedVolatility > 0) {
      setCustomIv((contract.impliedVolatility * 100).toFixed(1));
    }
    if (contract.expiration) {
      const expTime = new Date(contract.expiration + 'T16:00:00Z').getTime();
      const nowTime = Date.now();
      const days = Math.max(1, Math.round((expTime - nowTime) / (1000 * 60 * 60 * 24)));
      setDte(days.toString());
      const eRisk = checkEarningsRisk(ticker, days);
      setEarningsRisk(eRisk);
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

    const executeSave = async () => {
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

    if (isSimulatedData) {
      Alert.alert(
        'Simulated Data Notice',
        'This trade was calculated using estimated / simulated market data because live feeds were offline. Ensure you verify live strikes and bid/ask quotes with your broker before committing real funds.\n\nSave to active portfolio anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save Anyway', onPress: executeSave },
        ]
      );
      return;
    }

    await executeSave();
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
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. TICKER SEARCH & QUICK CHIPS */}
        <View style={styles.searchCard}>
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
                returnKeyType="search"
                onSubmitEditing={() => handleFetchQuote()}
              />
            </View>
            <TouchableOpacity style={styles.fetchBtn} onPress={() => handleFetchQuote()} disabled={fetchingQuote}>
              {fetchingQuote ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.fetchBtnText}>Fetch Quote</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Quick-Pick Ticker Chips */}
          <View style={styles.quickChipsRow}>
            {['NVDA', 'AAPL', 'TSLA', 'SPY', 'QQQ'].map((sym) => (
              <TouchableOpacity
                key={sym}
                style={[styles.quickChip, ticker === sym && styles.quickChipActive]}
                onPress={() => handleSelectQuickTicker(sym)}
                activeOpacity={0.75}
              >
                <Text style={[styles.quickChipText, ticker === sym && styles.quickChipTextActive]}>
                  {sym}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Market Session Status Banner */}
          <View style={styles.marketStatusRow}>
            <View style={[styles.marketStatusBadge, { backgroundColor: marketStatus.badgeBg }]}>
              <View style={[styles.marketStatusDot, { backgroundColor: marketStatus.badgeTextColor }]} />
              <Text style={[styles.marketStatusText, { color: marketStatus.badgeTextColor }]}>
                {marketStatus.label}
              </Text>
            </View>
            {stockPrice && parseFloat(stockPrice) > 0 && (
              <Text style={styles.marketPriceSummary}>
                {ticker}: ${parseFloat(stockPrice).toFixed(2)}
              </Text>
            )}
          </View>
        </View>


        {/* SIMULATED / MOCK DATA WARNING BANNER */}
        {isSimulatedData && (
          <View style={styles.simulatedBanner}>
            <AlertTriangle size={16} color="#F59E0B" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.simulatedBannerTitle}>Simulated Market Data</Text>
              <Text style={styles.simulatedBannerDesc}>
                Live broker feed is currently unavailable. Strikes and option prices are estimated models. Verify live quotes with your broker before trading.
              </Text>
            </View>
          </View>
        )}

        {/* EARNINGS CLIFF RISK WARNING BANNER */}
        {earningsRisk.hasEarningsRisk && (
          <View style={styles.earningsBanner}>
            <Calendar size={16} color="#EF4444" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.earningsBannerTitle}>
                Earnings Risk: {ticker.toUpperCase()} on {earningsRisk.earningsDate}
              </Text>
              <Text style={styles.earningsBannerDesc}>
                Earnings release scheduled {earningsRisk.daysUntilEarnings === 0 ? 'today' : `in ${earningsRisk.daysUntilEarnings} days`}, before this option expires. High risk of volatility collapse and post-earnings gap down.
              </Text>
            </View>
          </View>
        )}

        {/* DTE Syncing Spinner or 0DTE Indicator */}
        {isSyncingDte && (
          <View style={styles.syncingBanner}>
            <ActivityIndicator size="small" color="#60A5FA" style={{ marginRight: 8 }} />
            <Text style={styles.syncingBannerText}>
              {dte === '0'
                ? 'Recalculating for 0 DTE (Same-Day Expiration)...'
                : `Recalculating & Fetching ${dte || '30'}-Day Put Chain...`}
            </Text>
          </View>
        )}

        {dte === '0' && !isSyncingDte && (
          <View style={styles.zeroDteBanner}>
            <Sparkles size={13} color="#F59E0B" style={{ marginRight: 6 }} />
            <Text style={styles.zeroDteBannerText}>
              ⚡ 0 DTE: Evaluated as same-day expiration trade.
            </Text>
          </View>
        )}

        {/* 2. HERO SCORECARD & "THE BIG THREE" INCOME CARD */}
        {metrics && (
          <View style={styles.scoreCard}>
            <View style={styles.scoreHeroRow}>
              {/* Left: Circular Health Score Gauge */}
              <View style={styles.scoreGaugeContainer}>
                <View style={[styles.scoreRing, { borderColor: getScoreColor(metrics.score) }]}>
                  <Text style={[styles.scoreRingNumber, { color: getScoreColor(metrics.score) }]}>
                    {metrics.score}
                  </Text>
                  <Text style={styles.scoreRingDenominator}>/100</Text>
                </View>
                <View style={[styles.scorePill, { backgroundColor: `${getScoreColor(metrics.score)}22`, borderColor: getScoreColor(metrics.score) }]}>
                  <Text style={[styles.scorePillText, { color: getScoreColor(metrics.score) }]}>
                    {metrics.recommendationTitle}
                  </Text>
                </View>
              </View>

              {/* Right: The Big Three Income Metrics */}
              <View style={styles.heroMetricsCol}>
                <View style={styles.heroMetricItem}>
                  <Text style={styles.heroMetricLabel}>Total Cash Income</Text>
                  <Text style={styles.heroMetricCash}>
                    +${metrics.netPremium.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </Text>
                  <Text style={styles.heroMetricSub}>
                    Basis: ${metrics.effectiveCostBasis.toFixed(2)} ({metrics.effectiveDiscountPercent}% discount)
                  </Text>
                </View>

                <View style={styles.heroMetricDivider} />

                <View style={styles.heroRowBottom}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroMetricLabelSmall}>Collateral</Text>
                    <Text style={styles.heroMetricValSmall}>${metrics.collateralRequired.toLocaleString()}</Text>
                    <Text style={styles.heroMetricSubSmall}>{parsedContracts * 100} shares</Text>
                  </View>

                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.heroMetricLabelSmall}>Annual APR</Text>
                    <Text style={styles.heroMetricValSuccess}>{metrics.annualizedApr}%</Text>
                    <Text style={styles.heroMetricSubSmall}>Return: {metrics.returnOnCapitalPercent}%</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* 3. LIVE OPTIONS CHAIN CARD (Front & Center) */}
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
                    ref={expPillsScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.expPillsScroll}
                    contentContainerStyle={styles.expPillsContent}
                    onLayout={(e) => {
                      expPillsContainerWidthRef.current = e.nativeEvent.layout.width;
                    }}
                  >
                    <TouchableOpacity
                      style={[styles.expPill, selectedExpFilter === 'all' && styles.expPillActive]}
                      onPress={() => handleSelectExpFilter('all')}
                      onLayout={(e) => {
                        expPillLayoutsRef.current['all'] = {
                          x: e.nativeEvent.layout.x,
                          width: e.nativeEvent.layout.width,
                        };
                        if (selectedExpFilter === 'all') {
                          scrollToExpPill('all');
                        }
                      }}
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
                          onLayout={(e) => {
                            expPillLayoutsRef.current[exp] = {
                              x: e.nativeEvent.layout.x,
                              width: e.nativeEvent.layout.width,
                            };
                            if (isSelected) {
                              scrollToExpPill(exp);
                            }
                          }}
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
                  <ScrollView
                    ref={chainScrollRef}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                    onLayout={(e) => {
                      chainContainerHeightRef.current = e.nativeEvent.layout.height;
                    }}
                  >
                    {displayedContracts.map((contract: CSPOptionContract, idx: number) => {
                      const isSelected = selectedContract
                        ? (selectedContract.symbol === contract.symbol || (selectedContract.strike === contract.strike && selectedContract.expiration === contract.expiration))
                        : strikePrice === contract.strike.toFixed(2);
                      const rowKey = `${contract.strike}_${contract.expiration}`;
                      return (
                        <TouchableOpacity
                          key={contract.symbol || `${contract.strike}_${contract.expiration}_${idx}`}
                          style={[styles.chainRow, isSelected && styles.chainRowSelected]}
                          onPress={() => selectContractFromChain(contract)}
                          onLayout={(e) => {
                            chainRowLayoutsRef.current[rowKey] = {
                              y: e.nativeEvent.layout.y,
                              height: e.nativeEvent.layout.height,
                            };
                            if (isSelected) {
                              scrollToSelectedRow(rowKey);
                            }
                          }}
                          activeOpacity={0.8}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1.1 }}>
                            {isSelected && <View style={styles.selectedRowDot} />}
                            <Text style={[styles.chainStrike, isSelected && styles.chainStrikeSelected]}>
                              ${contract.strike.toFixed(2)} Put
                            </Text>
                          </View>
                          <Text style={[styles.chainExp, isSelected && styles.chainExpSelected]}>{contract.expiration}</Text>
                          <View style={styles.chainPremCol}>
                            <Text style={[styles.chainPrem, isSelected && styles.chainPremSelected]}>+${contract.premium.toFixed(2)}/sh</Text>
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

        {/* 4. PRIMARY ACTION BUTTONS */}
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

        {/* 5. EXPANDABLE "TRADE DETAILS, GREEKS & MANUAL ADJUSTMENTS" TRAY */}
        <View style={styles.advancedDrawerCard}>
          <TouchableOpacity
            style={styles.drawerHeader}
            onPress={() => setShowAdvancedChart(!showAdvancedChart)}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Target size={15} color="#60A5FA" style={{ marginRight: 6 }} />
                <Text style={styles.drawerTitle}>Trade Details, Greeks & Adjustments</Text>
              </View>
              {metrics?.greeks && (
                <Text style={styles.drawerSummaryText} numberOfLines={1}>
                  Win Rate {metrics.greeks.probabilityOfProfit}%  •  Daily Income +${(metrics.greeks.thetaPerDay * parsedContracts * 100).toFixed(2)}/d  •  {dte} Days Left
                </Text>
              )}
            </View>
            <View style={styles.drawerChevronBox}>
              {showAdvancedChart ? (
                <ChevronUp size={16} color="#94A3B8" />
              ) : (
                <ChevronDown size={16} color="#94A3B8" />
              )}
            </View>
          </TouchableOpacity>

          {showAdvancedChart && (
            <View style={styles.drawerContent}>
              {/* Greeks Grid */}
              {metrics?.greeks && (
                <View style={styles.greeksBar}>
                  <View style={styles.greekItem}>
                    <Text style={styles.greekLabel}>Delta</Text>
                    <Text style={styles.greekVal}>{metrics.greeks.delta}</Text>
                  </View>
                  <View style={styles.greekDivider} />
                  <View style={styles.greekItem}>
                    <Text style={styles.greekLabel}>Win Prob</Text>
                    <Text style={styles.greekValSuccess}>{metrics.greeks.probabilityOfProfit}%</Text>
                  </View>
                  <View style={styles.greekDivider} />
                  <View style={styles.greekItem}>
                    <Text style={styles.greekLabel}>Assignment</Text>
                    <Text style={metrics.greeks.probabilityAssignment > 30 ? styles.greekValDanger : styles.greekVal}>
                      {metrics.greeks.probabilityAssignment}%
                    </Text>
                  </View>
                  <View style={styles.greekDivider} />
                  <View style={styles.greekItem}>
                    <Text style={styles.greekLabel}>Daily Decay</Text>
                    <Text style={styles.greekVal}>+${(metrics.greeks.thetaPerDay * parsedContracts * 100).toFixed(2)}/d</Text>
                  </View>
                  <View style={styles.greekDivider} />
                  <View style={styles.greekItem}>
                    <Text style={styles.greekLabel}>Volatility (IV)</Text>
                    <Text style={styles.greekVal}>{metrics.greeks.impliedVolEstimate}%</Text>
                  </View>
                </View>
              )}

              {/* Custom IV Override Input */}
              {metrics?.greeks && (
                <View style={styles.ivRow}>
                  <Text style={styles.ivLabel}>Custom IV %:</Text>
                  <TextInput
                    style={styles.ivInput}
                    value={customIv}
                    onChangeText={setCustomIv}
                    placeholder={`${metrics.greeks.impliedVolEstimate}%`}
                    placeholderTextColor="#64748B"
                    keyboardType="decimal-pad"
                  />
                  {customIv ? (
                    <TouchableOpacity onPress={() => setCustomIv('')} style={styles.ivResetBtn}>
                      <Text style={styles.ivResetText}>Reset</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}

              {/* Payoff Chart */}
              {metrics && (
                <View style={{ marginTop: 12 }}>
                  <PayoffChart
                    stockPrice={parseFloat(stockPrice) || 0}
                    strikePrice={parseFloat(strikePrice) || 0}
                    premium={parseFloat(premium) || 0}
                    contracts={parsedContracts}
                  />
                </View>
              )}

              {/* Manual Parameter Fine-Tuning Matrix */}
              <View style={styles.manualInputsSection}>
                <Text style={styles.manualInputsTitle}>Manual Trade Fine-Tuning</Text>
                <View style={styles.formMatrix}>
                  <View style={styles.mCol}>
                    <Text style={styles.mLabel}>Stock ($)</Text>
                    <TextInput style={styles.mInput} value={stockPrice} onChangeText={setStockPrice} keyboardType="decimal-pad" />
                  </View>
                  <View style={styles.mCol}>
                    <Text style={styles.mLabel}>Strike ($)</Text>
                    <TextInput style={styles.mInput} value={strikePrice} onChangeText={setStrikePrice} keyboardType="decimal-pad" />
                  </View>
                  <View style={styles.mCol}>
                    <Text style={styles.mLabel}>Prem ($)</Text>
                    <TextInput style={styles.mInput} value={premium} onChangeText={setPremium} keyboardType="decimal-pad" />
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
                <View style={styles.helperBar}>
                  <Text style={styles.helperBarText}>
                    Total Net Premium Collected: <Text style={{ color: '#10B981', fontWeight: '800' }}>+${totalCashCollected.toFixed(2)}</Text> ({parsedContracts * 100} shares locked)
                  </Text>
                </View>
              </View>
            </View>
          )}
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
  searchCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  scoreCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  scoreHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreGaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 96,
    marginRight: 14,
  },
  scoreRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0F19',
    marginBottom: 6,
  },
  scoreRingNumber: {
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 24,
  },
  scoreRingDenominator: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: -2,
  },
  scorePill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: 96,
  },
  scorePillText: {
    fontSize: 9.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroMetricsCol: {
    flex: 1,
  },
  heroMetricItem: {
    marginBottom: 4,
  },
  heroMetricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  heroMetricCash: {
    fontSize: 24,
    fontWeight: '900',
    color: '#10B981',
    letterSpacing: -0.5,
  },
  heroMetricSub: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
  },
  heroMetricDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 6,
  },
  heroRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroMetricLabelSmall: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  heroMetricValSmall: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  heroMetricValSuccess: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#10B981',
  },
  heroMetricSubSmall: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  advancedDrawerCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 13,
  },
  drawerTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  drawerSummaryText: {
    fontSize: 10.5,
    color: '#60A5FA',
    fontWeight: '600',
    marginTop: 3,
  },
  drawerChevronBox: {
    padding: 4,
    backgroundColor: '#0F172A',
    borderRadius: 6,
    marginLeft: 8,
  },
  drawerContent: {
    paddingHorizontal: 13,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  manualInputsSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  manualInputsTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    borderWidth: 1.5,
  },
  selectedRowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
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
  chainStrikeSelected: {
    color: '#34D399',
    fontWeight: '800',
  },
  chainExp: {
    color: '#94A3B8',
    fontSize: 12,
  },
  chainExpSelected: {
    color: '#E2E8F0',
    fontWeight: '700',
  },
  chainPremCol: {
    alignItems: 'flex-end',
  },
  chainPrem: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '800',
  },
  chainPremSelected: {
    color: '#34D399',
    fontWeight: '900',
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
    borderWidth: 1.5,
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
  toggleChartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  toggleChartText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#60A5FA',
  },
  quickChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 10,
    marginBottom: 4,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginRight: 8,
  },
  quickChipActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#3B82F6',
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
  },
  quickChipTextActive: {
    color: '#FFFFFF',
  },
  marketStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  marketStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  marketStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  marketStatusText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  marketPriceSummary: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },

  syncingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E3A8A',
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  syncingBannerText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '700',
  },
  zeroDteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#78350F',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  zeroDteBannerText: {
    color: '#FCD34D',
    fontSize: 11.5,
    fontWeight: '700',
  },
  simulatedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D97706',
    padding: 10,
    marginBottom: 10,
  },
  simulatedBannerTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#F59E0B',
    marginBottom: 2,
  },
  simulatedBannerDesc: {
    fontSize: 11,
    color: '#FDE68A',
    lineHeight: 15,
  },
  earningsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DC2626',
    padding: 10,
    marginBottom: 10,
  },
  earningsBannerTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#EF4444',
    marginBottom: 2,
  },
  earningsBannerDesc: {
    fontSize: 11,
    color: '#FCA5A5',
    lineHeight: 15,
  },
  ivRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  ivLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    marginRight: 6,
  },
  ivInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 2,
  },
  ivResetBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#1E293B',
    borderRadius: 4,
  },
  ivResetText: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '700',
  },
});