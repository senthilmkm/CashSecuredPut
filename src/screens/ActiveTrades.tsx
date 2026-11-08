import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Briefcase,
  DollarSign,
  Shield,
  Calendar,
  RefreshCw,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Crown,
  Share2,
  Copy,
  X,
  ArrowRight,
  RotateCcw,
  LayoutGrid,
  List,
  TrendingUp,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CSPTrade, FREE_TIER_MAX_TRADES, FREE_TIER_MAX_HISTORY } from '../hooks/useAppStorage';
import { exportPortfolioPDF, exportPortfolioCSV, calculateDaysRemaining } from '../services/exportService';
import { getMarketQuote } from '../services/publicApi';
import { checkEarningsRisk } from '../services/earningsService';
import MonthlyIncomeChart from '../components/MonthlyIncomeChart';
import { groupTradesByMonth, calculateGoalPacing } from '../services/incomeAnalytics';

interface ActiveTradesProps {
  trades: CSPTrade[];
  history?: CSPTrade[];
  onUpdateStatus: (tradeId: string, status: 'expired_worthless' | 'assigned' | 'closed_early') => void;
  onRemoveTrade: (tradeId: string) => void;
  onRollTrade: (trade: CSPTrade) => void;
  onOpenRollSim?: () => void;
  onTransitionToWheel?: (tradeData: { ticker: string; strike: number; premium: number; shares: number }) => void;
  onOpenPaywall: () => void;
  isPremium: boolean;
}

export default function ActiveTrades({
  trades,
  history = [],
  onUpdateStatus,
  onRemoveTrade,
  onRollTrade,
  onOpenRollSim,
  onTransitionToWheel,
  onOpenPaywall,
  isPremium,
}: ActiveTradesProps) {

  const [viewMode, setViewMode] = useState<'active' | 'history' | 'analytics'>('active');
  const [annualGoal, setAnnualGoal] = useState<number>(5000);

  useEffect(() => {
    AsyncStorage.getItem('@CashSecuredProfit:annual_income_goal').then((val) => {
      if (val) {
        const parsed = parseFloat(val);
        if (!isNaN(parsed) && parsed > 0) setAnnualGoal(parsed);
      }
    });
  }, []);

  const handleUpdateGoal = async (newGoal: number) => {
    setAnnualGoal(newGoal);
    await AsyncStorage.setItem('@CashSecuredProfit:annual_income_goal', newGoal.toString());
  };
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'itm' | 'expiring'>('all');
  const [cardLayout, setCardLayout] = useState<'detailed' | 'compact'>('detailed');
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportData, setExportData] = useState<{ ticker: string; costBasis: string; shares: number } | null>(null);
  const [exportTradeObj, setExportTradeObj] = useState<CSPTrade | null>(null);

  // Live Portfolio Market Quotes
  const [liveQuotes, setLiveQuotes] = useState<Record<string, { price: number; change: number; changePercent: number; updatedAt: number }>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastFetchRef = useRef<number>(0);

  const refreshPortfolioQuotes = useCallback(async (force = false) => {
    if (trades.length === 0) return;
    const now = Date.now();
    if (!force && now - lastFetchRef.current < 15000) return;
    lastFetchRef.current = now;

    setIsRefreshing(true);
    const uniqueTickers = Array.from(new Set(trades.map((t) => t.ticker.toUpperCase().trim())));

    try {
      const results = await Promise.allSettled(
        uniqueTickers.map(async (ticker) => {
          const q = await getMarketQuote(ticker);
          return { ticker, quote: q };
        })
      );

      setLiveQuotes((prev) => {
        const next = { ...prev };
        results.forEach((res) => {
          if (res.status === 'fulfilled' && res.value?.quote?.price > 0) {
            next[res.value.ticker] = {
              price: res.value.quote.price,
              change: res.value.quote.change || 0,
              changePercent: res.value.quote.changePercent || 0,
              updatedAt: Date.now(),
            };
          }
        });
        return next;
      });
    } catch (err) {
      console.warn('[ActiveTrades] Failed to refresh portfolio quotes:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [trades]);

  useEffect(() => {
    refreshPortfolioQuotes();
  }, [refreshPortfolioQuotes]);

  const getTradeStockPrice = (t: CSPTrade) => liveQuotes[t.ticker]?.price ?? t.stockPrice;

  const totalCollateral = trades.reduce((sum, t) => sum + t.strikePrice * 100 * t.contracts, 0);
  const totalPremium = trades.reduce((sum, t) => sum + t.premium * 100 * t.contracts - t.commissions, 0);
  const totalLifetimeRealized = history.reduce((sum, t) => sum + ((t.cumulativePremium !== undefined ? t.cumulativePremium : t.premium) * 100 * t.contracts - t.commissions), 0);
  const itmCount = trades.filter((t) => t.strikePrice > getTradeStockPrice(t)).length;

  const filteredTrades = trades.filter((t) => {
    const curStock = getTradeStockPrice(t);
    const isITM = t.strikePrice > curStock;
    const dteLeft = calculateDaysRemaining(t.expirationDate, t.dte);
    if (selectedFilter === 'itm') return isITM;
    if (selectedFilter === 'expiring') return dteLeft <= 5;
    return true;
  });

  const handleMarkAssigned = (trade: CSPTrade) => {
    const basisCredit = trade.cumulativeCostBasisCredit || trade.cumulativePremium || trade.premium;
    const effectiveCostBasis = Math.max(0, trade.strikePrice - basisCredit).toFixed(2);
    const shares = trade.contracts * 100;

    onUpdateStatus(trade.id, 'assigned');
    setExportTradeObj(trade);
    setExportData({
      ticker: trade.ticker,
      costBasis: effectiveCostBasis,
      shares,
    });
    setExportModalVisible(true);
  };

  const handleExportPrompt = () => {
    if (!isPremium) {
      onOpenPaywall();
      return;
    }
    Alert.alert(
      'Export Portfolio Report',
      'Choose your preferred export format:',
      [
        {
          text: 'PDF Report',
          onPress: async () => {
            const success = await exportPortfolioPDF(trades, history);
            if (success) {
              Alert.alert('Report Generated', 'PDF Portfolio Report created successfully.');
            }
          },
        },
        {
          text: 'CSV Spreadsheet',
          onPress: async () => {
            const success = await exportPortfolioCSV(trades, history);
            if (success) {
              Alert.alert('CSV Exported', 'CSV spreadsheet file shared successfully.');
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleCopyParams = () => {
    if (!exportData) return;
    const summary = `Ticker: ${exportData.ticker}\nPurchase Price: $${exportData.costBasis}\nShares: ${exportData.shares}`;
    
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator?.clipboard) {
      navigator.clipboard.writeText(summary);
    }
    Alert.alert('Assignment Details', summary);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => refreshPortfolioQuotes(true)}
          tintColor="#3B82F6"
          colors={['#3B82F6']}
        />
      }
    >
      {/* Portfolio View Mode Segmented Selector */}
      <View style={styles.viewModeHeader}>
        <View style={styles.viewModeSegment}>
          <TouchableOpacity
            style={[styles.segmentBtn, viewMode === 'active' && styles.segmentBtnActive]}
            onPress={() => setViewMode('active')}
            activeOpacity={0.8}
          >
            <Briefcase size={13} color={viewMode === 'active' ? '#FFF' : '#64748B'} style={{ marginRight: 5 }} />
            <Text style={[styles.segmentText, viewMode === 'active' && styles.segmentTextActive]}>
              Active ({trades.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, viewMode === 'history' && styles.segmentBtnActive]}
            onPress={() => setViewMode('history')}
            activeOpacity={0.8}
          >
            <Clock size={13} color={viewMode === 'history' ? '#FFF' : '#64748B'} style={{ marginRight: 5 }} />
            <Text style={[styles.segmentText, viewMode === 'history' && styles.segmentTextActive]}>
              History ({history.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, viewMode === 'analytics' && styles.segmentBtnActive]}
            onPress={() => setViewMode('analytics')}
            activeOpacity={0.8}
          >
            <TrendingUp size={13} color={viewMode === 'analytics' ? '#FFF' : '#64748B'} style={{ marginRight: 4 }} />
            <Text style={[styles.segmentText, viewMode === 'analytics' && styles.segmentTextActive]}>
              Paycheck 📊
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.refreshQuoteBtn}
          onPress={() => refreshPortfolioQuotes(true)}
          disabled={isRefreshing}
          activeOpacity={0.8}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <RefreshCw size={13} color="#60A5FA" />
          )}
        </TouchableOpacity>
      </View>
      {/* Overview Summary Cards (Active vs History vs Analytics) */}
      {viewMode === 'active' ? (
        <>
          <View style={styles.overviewGrid}>
            <View style={styles.overviewCard}>
              <Text style={styles.overviewLabel}>Locked Collateral</Text>
              <Text style={styles.overviewValPrimary}>${totalCollateral.toLocaleString()}</Text>
              <Text style={styles.overviewSub}>{trades.length} Active Position{trades.length !== 1 ? 's' : ''}</Text>
            </View>

            <View style={styles.overviewCard}>
              <Text style={styles.overviewLabel}>Active Net Premium</Text>
              <Text style={styles.overviewValSuccess}>+${totalPremium.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              <Text style={styles.overviewSub}>
                Avg Return: {totalCollateral > 0 ? ((totalPremium / totalCollateral) * 100).toFixed(2) : '0.00'}%
              </Text>
            </View>
          </View>

          {/* Quick Paycheck Teaser Banner */}
          <TouchableOpacity
            style={styles.incomeQuickBanner}
            onPress={() => setViewMode('analytics')}
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TrendingUp size={14} color="#10B981" style={{ marginRight: 8 }} />
              <Text style={styles.incomeQuickBannerText}>
                Lifetime Options Paycheck: +${totalLifetimeRealized.toFixed(2)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.incomeQuickBannerLink}>View Goals</Text>
              <ArrowRight size={12} color="#10B981" style={{ marginLeft: 3 }} />
            </View>
          </TouchableOpacity>
        </>
      ) : viewMode === 'history' ? (
        <View style={styles.overviewGrid}>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>Lifetime Realized Income</Text>
            <Text style={styles.overviewValSuccess}>+${totalLifetimeRealized.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            <Text style={styles.overviewSub}>From {history.length} Completed Trades</Text>
          </View>

          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>Completed Positions</Text>
            <Text style={styles.overviewValPrimary}>{history.length}</Text>
            <Text style={styles.overviewSub}>
              {history.filter(h => h.status === 'expired_worthless').length} Expired Worthless
            </Text>
          </View>
        </View>
      ) : null}

      {/* Portfolio Quick Tools Bar */}
      <View style={styles.exportBar}>
        <TouchableOpacity style={styles.exportPdfBtn} onPress={handleExportPrompt} activeOpacity={0.85}>
          {isPremium ? (
            <Share2 size={13} color="#FFF" style={{ marginRight: 5 }} />
          ) : (
            <Crown size={13} color="#F59E0B" style={{ marginRight: 5 }} />
          )}
          <Text style={styles.exportPdfBtnText}>
            {isPremium ? 'Export Report' : 'Export (PRO)'}
          </Text>
        </TouchableOpacity>

        {onOpenRollSim && (
          <TouchableOpacity style={styles.quickRollBtn} onPress={onOpenRollSim} activeOpacity={0.85}>
            <RefreshCw size={13} color="#10B981" style={{ marginRight: 5 }} />
            <Text style={styles.quickRollBtnText}>Roll Simulator</Text>
          </TouchableOpacity>
        )}
      </View>


      {/* Free Tier Limit Warning Banner */}
      {!isPremium && trades.length >= FREE_TIER_MAX_TRADES && viewMode === 'active' && (
        <TouchableOpacity style={styles.paywallBanner} onPress={onOpenPaywall} activeOpacity={0.85}>
          <LinearGradient colors={['#7C3AED', '#4C1D95']} style={styles.bannerGradient}>
            <Crown color="#F59E0B" size={24} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>Free Tier Limit Reached ({trades.length}/{FREE_TIER_MAX_TRADES} Active)</Text>
              <Text style={styles.bannerSub}>Upgrade to Pro for unlimited simultaneous trades & automated expiration alerts.</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Tab Views: Analytics vs History vs Active */}
      {viewMode === 'analytics' ? (
        <View style={{ marginTop: 4 }}>
          <MonthlyIncomeChart
            history={history}
            isPremium={isPremium}
            onOpenPaywall={onOpenPaywall}
            annualGoal={annualGoal}
            onUpdateGoal={handleUpdateGoal}
          />

          {/* Analytics Key Metrics Grid */}
          <View style={styles.analyticsStatsGrid}>
            <View style={styles.analyticsStatCard}>
              <Text style={styles.analyticsStatLabel}>Lifetime Realized</Text>
              <Text style={styles.analyticsStatValGreen}>+${totalLifetimeRealized.toFixed(2)}</Text>
              <Text style={styles.analyticsStatSub}>{history.length} Closed Trades</Text>
            </View>

            <View style={styles.analyticsStatCard}>
              <Text style={styles.analyticsStatLabel}>Win Rate (% Expired)</Text>
              <Text style={styles.analyticsStatValPrimary}>
                {history.length > 0
                  ? `${Math.round((history.filter(h => h.status === 'expired_worthless').length / history.length) * 100)}%`
                  : '100%'}
              </Text>
              <Text style={styles.analyticsStatSub}>
                {history.filter(h => h.status === 'expired_worthless').length} Expired Worthless
              </Text>
            </View>
          </View>

          {/* Strategic Income Advice Card */}
          <View style={styles.tipCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Crown size={15} color="#F59E0B" style={{ marginRight: 6 }} />
              <Text style={styles.tipTitle}>Wheel Income Rule #1</Text>
            </View>
            <Text style={styles.tipDesc}>
              Consistent options sellers target 30–45 DTE puts at 0.20–0.30 Delta. This maximizes theta time decay while keeping collateral safety buffer over 80%.
            </Text>
          </View>
        </View>
      ) : viewMode === 'history' ? (
        <>
          <MonthlyIncomeChart
            history={history}
            isPremium={isPremium}
            onOpenPaywall={onOpenPaywall}
            annualGoal={annualGoal}
            onUpdateGoal={handleUpdateGoal}
          />

          {history.length === 0 ? (
            <View style={styles.emptyCard}>
              <Clock color="#475569" size={48} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>No Trade History Yet</Text>
              <Text style={styles.emptySub}>
                Positions marked as expired, assigned, or closed early will appear here automatically.
              </Text>
            </View>
          ) : (
            <>
              {(isPremium ? history : history.slice(0, FREE_TIER_MAX_HISTORY)).map((hTrade) => {
                const hPrem = hTrade.cumulativePremium !== undefined ? hTrade.cumulativePremium : hTrade.premium;
                const netIncome = (hPrem * 100 * hTrade.contracts - hTrade.commissions).toFixed(2);
                const effBasis = Math.max(0, hTrade.strikePrice - (hTrade.cumulativeCostBasisCredit || hPrem)).toFixed(2);
                const statusLabel =
                  hTrade.status === 'expired_worthless'
                    ? 'Expired Worthless (100% Win)'
                    : hTrade.status === 'assigned'
                    ? 'Assigned (Exported)'
                    : 'Closed Early';

                const statusStyle =
                  hTrade.status === 'expired_worthless'
                    ? styles.tagOTM
                    : hTrade.status === 'assigned'
                    ? styles.tagITM
                    : styles.tagWarning;

                const textStyle =
                  hTrade.status === 'expired_worthless'
                    ? styles.tagTextOTM
                    : hTrade.status === 'assigned'
                    ? styles.tagTextITM
                    : styles.tagTextWarning;

                return (
                  <View key={hTrade.id} style={styles.tradeCard}>
                    <View style={styles.cardTopRow}>
                      <View style={styles.tickerGroup}>
                        <Text style={styles.tickerText}>{hTrade.ticker}</Text>
                        <View style={[styles.statusTag, statusStyle]}>
                          <Text style={[styles.tagText, textStyle]}>{statusLabel}</Text>
                        </View>
                      </View>
                      <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '600' }}>
                        {hTrade.contracts} Contract{hTrade.contracts !== 1 ? 's' : ''}
                      </Text>
                    </View>

                    <View style={styles.tradeGrid}>
                      <View style={styles.tradeCol}>
                        <Text style={styles.tradeLabel}>Strike Price</Text>
                        <Text style={styles.tradeVal}>${hTrade.strikePrice.toFixed(2)}</Text>
                      </View>

                      <View style={styles.tradeCol}>
                        <Text style={styles.tradeLabel}>Realized Income</Text>
                        <Text style={styles.tradeValSuccess}>+${netIncome}</Text>
                      </View>

                      <View style={styles.tradeCol}>
                        <Text style={styles.tradeLabel}>Effective Basis</Text>
                        <Text style={styles.tradeVal}>${effBasis}</Text>
                      </View>

                      <View style={styles.tradeCol}>
                        <Text style={styles.tradeLabel}>Collateral</Text>
                        <Text style={styles.tradeValPrimary}>${(hTrade.strikePrice * 100 * hTrade.contracts).toLocaleString()}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}

              {!isPremium && history.length > FREE_TIER_MAX_HISTORY && (
                <TouchableOpacity style={styles.historyPaywallCard} onPress={onOpenPaywall} activeOpacity={0.85}>
                  <Crown size={22} color="#F59E0B" style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyPaywallTitle}>
                      +{history.length - FREE_TIER_MAX_HISTORY} More Closed Trade{history.length - FREE_TIER_MAX_HISTORY !== 1 ? 's' : ''} Saved
                    </Text>
                    <Text style={styles.historyPaywallSub}>
                      Free tier displays your {FREE_TIER_MAX_HISTORY} most recent closed trades. Upgrade to Pro for complete lifetime trade journaling and PDF/CSV exports.
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {/* ITM Risk Alert Banner */}
          {itmCount > 0 && (
            <TouchableOpacity
              style={styles.itmAlertBanner}
              onPress={() => setSelectedFilter(selectedFilter === 'itm' ? 'all' : 'itm')}
              activeOpacity={0.8}
            >
              <AlertCircle size={15} color="#EF4444" style={{ marginRight: 8 }} />
              <Text style={styles.itmAlertText}>
                ⚠️ {itmCount} Position{itmCount > 1 ? 's' : ''} In-The-Money (Assignment Risk) • Tap to Filter
              </Text>
            </TouchableOpacity>
          )}

          {/* Filter Row with Compact vs Detailed Switcher */}
          <View style={styles.filterControlRow}>
            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.filterChip, selectedFilter === 'all' && styles.filterChipActive]}
                onPress={() => setSelectedFilter('all')}
              >
                <Text style={[styles.filterChipText, selectedFilter === 'all' && styles.filterTextActive]}>All ({trades.length})</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterChip, selectedFilter === 'itm' && styles.filterChipActive]}
                onPress={() => setSelectedFilter('itm')}
              >
                <Text style={[styles.filterChipText, selectedFilter === 'itm' && styles.filterTextActive]}>At Risk (ITM) ({itmCount})</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterChip, selectedFilter === 'expiring' && styles.filterChipActive]}
                onPress={() => setSelectedFilter('expiring')}
              >
                <Text style={[styles.filterChipText, selectedFilter === 'expiring' && styles.filterTextActive]}>Expiring Soon (≤5d)</Text>
              </TouchableOpacity>
            </View>

            {/* Layout Toggle */}
            <View style={styles.layoutSwitch}>
              <TouchableOpacity
                style={[styles.layoutSwitchBtn, cardLayout === 'detailed' && styles.layoutSwitchBtnActive]}
                onPress={() => setCardLayout('detailed')}
                activeOpacity={0.8}
              >
                <LayoutGrid size={13} color={cardLayout === 'detailed' ? '#FFF' : '#64748B'} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.layoutSwitchBtn, cardLayout === 'compact' && styles.layoutSwitchBtnActive]}
                onPress={() => setCardLayout('compact')}
                activeOpacity={0.8}
              >
                <List size={13} color={cardLayout === 'compact' ? '#FFF' : '#64748B'} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Empty State */}
          {filteredTrades.length === 0 ? (
            <View style={styles.emptyCard}>
              <Briefcase color="#475569" size={48} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>No Active CSP Positions</Text>
              <Text style={styles.emptySub}>
                {trades.length === 0
                  ? 'Use the Analyzer tab to calculate and save your first Cash-Secured Put trade.'
                  : 'No trades match the selected filter.'}
              </Text>
            </View>
          ) : (
            filteredTrades.map((trade) => {
              const liveQuote = liveQuotes[trade.ticker];
              const currentStockPrice = liveQuote?.price ?? trade.stockPrice;
              const isITM = trade.strikePrice > currentStockPrice;
              const cushionPercent = currentStockPrice > 0 ? ((currentStockPrice - trade.strikePrice) / currentStockPrice) * 100 : 0;
              const basisCredit = trade.cumulativeCostBasisCredit || trade.cumulativePremium || trade.premium;
              const effectiveCost = Math.max(0, trade.strikePrice - basisCredit).toFixed(2);
              const netIncome = (trade.premium * 100 * trade.contracts - trade.commissions).toFixed(2);
              const collateral = trade.strikePrice * 100 * trade.contracts;
              const dteLeft = calculateDaysRemaining(trade.expirationDate, trade.dte);
              const eRisk = checkEarningsRisk(trade.ticker, trade.expirationDate || trade.dte);

              if (cardLayout === 'compact') {
                return (
                  <View key={trade.id} style={styles.compactCard}>
                    <View style={{ flex: 1.3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text style={styles.compactTicker}>{trade.ticker}</Text>
                        <View style={[styles.statusTag, isITM ? styles.tagITM : styles.tagOTM, { marginLeft: 6 }]}>
                          <Text style={[styles.tagText, isITM ? styles.tagTextITM : styles.tagTextOTM, { fontSize: 10 }]}>
                            {isITM ? 'ITM' : 'OTM'}
                          </Text>
                        </View>
                        {eRisk.hasEarningsRisk && (
                          <View style={styles.compactEarningsTag}>
                            <Text style={styles.compactEarningsText}>⚠️ ER {eRisk.daysUntilEarnings}d</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.compactSub}>
                        ${trade.strikePrice.toFixed(2)} Put • Live: ${currentStockPrice.toFixed(2)}
                        {liveQuote ? ` (${liveQuote.changePercent >= 0 ? '+' : ''}${liveQuote.changePercent.toFixed(1)}%)` : ''} • {dteLeft}d left
                      </Text>
                    </View>

                    <View style={{ flex: 0.9, alignItems: 'flex-end', marginRight: 10 }}>
                      <Text style={styles.compactIncome}>+${netIncome}</Text>
                      <Text style={styles.compactSub}>Basis: ${effectiveCost}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity
                        style={styles.compactActionBtn}
                        onPress={() => onRollTrade(trade)}
                        activeOpacity={0.8}
                      >
                        <RotateCcw size={14} color="#3B82F6" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.compactActionBtn, { marginLeft: 6 }]}
                        onPress={() => onUpdateStatus(trade.id, 'expired_worthless')}
                        activeOpacity={0.8}
                      >
                        <CheckCircle2 size={14} color="#10B981" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }

              return (
                <View key={trade.id} style={styles.tradeCard}>
              <View style={styles.cardTopRow}>
                <View style={styles.tickerGroup}>
                  <Text style={styles.tickerText}>{trade.ticker}</Text>
                  <View style={[styles.statusTag, isITM ? styles.tagITM : styles.tagOTM]}>
                    <Text style={[styles.tagText, isITM ? styles.tagTextITM : styles.tagTextOTM]}>
                      {isITM ? 'ITM Risk' : 'OTM Profitable'}
                    </Text>
                  </View>
                  {eRisk.hasEarningsRisk && (
                    <View style={styles.earningsTag}>
                      <Text style={styles.earningsTagText}>⚠️ Earnings {eRisk.earningsDate}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.dteBadge}>
                  <Clock color="#94A3B8" size={12} style={{ marginRight: 4 }} />
                  <Text style={styles.dteText}>{dteLeft} Days Left</Text>
                </View>
              </View>

              <View style={styles.tradeGrid}>
                <View style={styles.tradeCol}>
                  <Text style={styles.tradeLabel}>Strike / Live Stock</Text>
                  <Text style={styles.tradeVal}>${trade.strikePrice.toFixed(2)} / ${currentStockPrice.toFixed(2)}</Text>
                  <Text style={[styles.tradeCushionSub, { color: isITM ? '#EF4444' : '#10B981' }]}>
                    {isITM
                      ? `-$${Math.abs(currentStockPrice - trade.strikePrice).toFixed(2)} ITM`
                      : `+${cushionPercent.toFixed(1)}% cushion`}
                  </Text>
                </View>

                <View style={styles.tradeCol}>
                  <Text style={styles.tradeLabel}>Net Income</Text>
                  <Text style={styles.tradeValSuccess}>+${netIncome}</Text>
                </View>

                <View style={styles.tradeCol}>
                  <Text style={styles.tradeLabel}>Effective Cost</Text>
                  <Text style={styles.tradeVal}>${effectiveCost}/sh</Text>
                </View>

                <View style={styles.tradeCol}>
                  <Text style={styles.tradeLabel}>Collateral</Text>
                  <Text style={styles.tradeValPrimary}>${collateral.toLocaleString()}</Text>
                </View>
              </View>

              <View style={styles.cardActionsRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnSuccess]}
                  onPress={() =>
                    Alert.alert(
                      'Mark Expired Worthless?',
                      'Option expired worthless. You keep 100% of the premium income.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Confirm', onPress: () => onUpdateStatus(trade.id, 'expired_worthless') },
                      ]
                    )
                  }
                >
                  <CheckCircle2 color="#10B981" size={14} style={{ marginRight: 4 }} />
                  <Text style={styles.btnSuccessText}>Expired (100% Win)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnWarning]}
                  onPress={() => handleMarkAssigned(trade)}
                >
                  <ExternalLink color="#F59E0B" size={14} style={{ marginRight: 4 }} />
                  <Text style={styles.btnWarningText}>Assigned & Export</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.iconActionBtn} onPress={() => onRollTrade(trade)}>
                  <RefreshCw color="#3B82F6" size={16} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.iconActionBtn} onPress={() => onRemoveTrade(trade.id)}>
                  <Trash2 color="#EF4444" size={16} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

        </>
      )}

      {/* Wheel Strategy Assignment Export Modal */}
      <Modal visible={exportModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Wheel Strategy: Position Assigned</Text>
              <TouchableOpacity onPress={() => setExportModalVisible(false)}>
                <X color="#94A3B8" size={20} />
              </TouchableOpacity>
            </View>

            {exportData && (
              <View style={styles.exportBody}>
                <Text style={styles.exportDesc}>
                  Your CSP position was assigned. You now own <Text style={{ color: '#FFF', fontWeight: '800' }}>{exportData.shares} shares of {exportData.ticker}</Text> at a net cost basis of:
                </Text>

                <View style={styles.costBox}>
                  <Text style={styles.costBoxLabel}>Net Effective Stock Cost Basis</Text>
                  <Text style={styles.costBoxVal}>${exportData.costBasis} / share</Text>
                  <Text style={styles.costBoxSub}>Ready to sell Covered Calls</Text>
                </View>

                <TouchableOpacity
                  style={styles.launchBtn}
                  onPress={() => {
                    setExportModalVisible(false);
                    if (onTransitionToWheel && exportTradeObj) {
                      const prem = exportTradeObj.cumulativePremium || exportTradeObj.premium;
                      onTransitionToWheel({
                        ticker: exportTradeObj.ticker,
                        strike: exportTradeObj.strikePrice,
                        premium: prem,
                        shares: exportTradeObj.contracts * 100,
                      });
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={['#10B981', '#059669']} style={styles.launchGradient}>
                    <RotateCcw color="#FFF" size={18} style={{ marginRight: 8 }} />
                    <Text style={styles.launchBtnText}>Manage in Wheel Suite Tab</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={styles.copyBtn} onPress={handleCopyParams} activeOpacity={0.85}>
                  <Copy color="#3B82F6" size={16} style={{ marginRight: 6 }} />
                  <Text style={styles.copyBtnText}>Copy Parameters to Clipboard</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
    viewModeSegment: {
      flexDirection: 'row',
      backgroundColor: '#161E2E',
      borderRadius: 12,
      padding: 4,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: '#1E293B',
    },
    segmentBtn: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 8,
    },
    segmentBtnActive: {
      backgroundColor: '#3B82F6',
    },
    segmentText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#64748B',
    },
    segmentTextActive: {
      color: '#FFF',
    },
    tagWarning: {
      backgroundColor: '#451A03',
    },
    tagTextWarning: {
      color: '#F59E0B',
    },
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  overviewGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  overviewCard: {
    width: '48%',
    backgroundColor: '#161E2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  overviewLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
  },
  overviewValPrimary: {
    fontSize: 20,
    fontWeight: '800',
    color: '#3B82F6',
    marginBottom: 2,
  },
  overviewValSuccess: {
    fontSize: 20,
    fontWeight: '800',
    color: '#10B981',
    marginBottom: 2,
  },
  overviewSub: {
    fontSize: 11,
    color: '#64748B',
  },
  paywallBanner: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
  },
  bannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  bannerTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  bannerSub: {
    color: '#DDD6FE',
    fontSize: 11,
  },
  historyPaywallCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161C2D',
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  historyPaywallTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F59E0B',
    marginBottom: 2,
  },
  historyPaywallSub: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
  },
  itmAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  itmAlertText: {
    color: '#FCA5A5',
    fontSize: 12.5,
    fontWeight: '700',
    flex: 1,
  },
  filterControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    flex: 1,
  },
  layoutSwitch: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 2,
    marginLeft: 6,
  },
  layoutSwitchBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  layoutSwitchBtnActive: {
    backgroundColor: '#1E293B',
  },
  compactCard: {
    backgroundColor: '#161E2E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactTicker: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  compactSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  compactIncome: {
    fontSize: 15,
    fontWeight: '800',
    color: '#10B981',
  },
  compactActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#161E2E',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  filterChipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#FFF',
  },
  emptyCard: {
    backgroundColor: '#161E2E',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginTop: 20,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySub: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  tradeCard: {
    backgroundColor: '#161E2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tickerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickerText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    marginRight: 10,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagOTM: {
    backgroundColor: '#064E3B',
  },
  tagITM: {
    backgroundColor: '#450A0A',
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tagTextOTM: {
    color: '#10B981',
  },
  tagTextITM: {
    color: '#EF4444',
  },
  dteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dteText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  tradeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#0B0F19',
    paddingTop: 10,
  },
  tradeCol: {
    width: '48%',
    marginBottom: 8,
  },
  tradeLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  tradeVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  tradeValSuccess: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
  },
  tradeValPrimary: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3B82F6',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#0B0F19',
    paddingTop: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  btnSuccess: {
    backgroundColor: '#064E3B',
  },
  btnSuccessText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  btnWarning: {
    backgroundColor: '#451A03',
  },
  btnWarningText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
  },
  iconActionBtn: {
    padding: 8,
    backgroundColor: '#0B0F19',
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#161E2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  exportBody: {
    alignItems: 'stretch',
  },
  exportDesc: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 14,
  },
  costBox: {
    backgroundColor: '#0F291E',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#10B981',
    marginBottom: 16,
  },
  costBoxLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
  },
  costBoxVal: {
    fontSize: 24,
    fontWeight: '900',
    color: '#10B981',
    marginBottom: 2,
  },
  costBoxSub: {
    fontSize: 11,
    color: '#A7F3D0',
  },
  launchBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
  },
  launchGradient: {
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  launchBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 15,
  },
  copyBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E3A8A',
  },
  copyBtnText: {
    color: '#3B82F6',
    fontWeight: '700',
    fontSize: 14,
  },
  exportBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  exportPdfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E3A8A',
    marginRight: 8,
  },
  exportPdfBtnText: {
    color: '#3B82F6',
    fontWeight: '700',
    fontSize: 12.5,
  },
  quickRollBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  quickRollBtnText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 12.5,
  },

  viewModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  refreshQuoteBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#161E2E',
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  compactEarningsTag: {
    backgroundColor: '#451A03',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#D97706',
    marginLeft: 5,
  },
  compactEarningsText: {
    color: '#FDE68A',
    fontSize: 9,
    fontWeight: '800',
  },
  earningsTag: {
    backgroundColor: '#451A03',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D97706',
    marginLeft: 6,
  },
  earningsTagText: {
    color: '#FDE68A',
    fontSize: 10,
    fontWeight: '800',
  },
  tradeCushionSub: {
    fontSize: 9.5,
    fontWeight: '700',
    marginTop: 2,
  },
  incomeQuickBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#064E3B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#047857',
  },
  incomeQuickBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D1FAE5',
  },
  incomeQuickBannerLink: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6EE7B7',
  },
  analyticsStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  analyticsStatCard: {
    width: '48%',
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  analyticsStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 4,
  },
  analyticsStatValGreen: {
    fontSize: 18,
    fontWeight: '800',
    color: '#10B981',
    marginBottom: 2,
  },
  analyticsStatValPrimary: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3B82F6',
    marginBottom: 2,
  },
  analyticsStatSub: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
  },
  tipCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F59E0B',
  },
  tipDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
  },
});