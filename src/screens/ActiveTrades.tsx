import React, { useState } from 'react';
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
} from 'lucide-react-native';
import { CSPTrade } from '../hooks/useAppStorage';

interface ActiveTradesProps {
  trades: CSPTrade[];
  onUpdateStatus: (tradeId: string, status: 'expired_worthless' | 'assigned' | 'closed_early') => void;
  onRemoveTrade: (tradeId: string) => void;
  onRollTrade: (trade: CSPTrade) => void;
  onOpenPaywall: () => void;
  isPremium: boolean;
}

const COVERED_PROFIT_APP_STORE_URL = 'https://apps.apple.com/app/id6788692802';

export default function ActiveTrades({
  trades,
  onUpdateStatus,
  onRemoveTrade,
  onRollTrade,
  onOpenPaywall,
  isPremium,
}: ActiveTradesProps) {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'itm' | 'expiring'>('all');
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportData, setExportData] = useState<{ ticker: string; costBasis: string; shares: number } | null>(null);

  const totalCollateral = trades.reduce((sum, t) => sum + t.strikePrice * 100 * t.contracts, 0);
  const totalPremium = trades.reduce((sum, t) => sum + (t.cumulativePremium || t.premium) * 100 * t.contracts - t.commissions, 0);

  const filteredTrades = trades.filter((t) => {
    const isITM = t.strikePrice > t.stockPrice;
    if (selectedFilter === 'itm') return isITM;
    if (selectedFilter === 'expiring') return t.dte <= 5;
    return true;
  });

  const handleMarkAssigned = (trade: CSPTrade) => {
    const effectiveCostBasis = (trade.strikePrice - trade.premium).toFixed(2);
    const shares = trade.contracts * 100;

    onUpdateStatus(trade.id, 'assigned');
    setExportData({
      ticker: trade.ticker,
      costBasis: effectiveCostBasis,
      shares,
    });
    setExportModalVisible(true);
  };

  const handleLaunchCoveredProfit = async () => {
    if (!exportData) return;
    const deepLinkUrl = `coveredprofit://importTrade?ticker=${exportData.ticker}&costBasis=${exportData.costBasis}&shares=${exportData.shares}`;
    
    try {
      // Attempt direct launch into CoveredProfit app first
      await Linking.openURL(deepLinkUrl);
    } catch (e) {
      // CoveredProfit app is not installed on device -> Fallback to App Store!
      try {
        await Linking.openURL(COVERED_PROFIT_APP_STORE_URL);
      } catch (err) {
        Alert.alert('App Store Error', 'Could not open CoveredProfit or App Store.');
      }
    }
  };

  const handleCopyParams = () => {
    if (!exportData) return;
    const summary = `Ticker: ${exportData.ticker}\nPurchase Price: $${exportData.costBasis}\nShares: ${exportData.shares}`;
    
    if (Platform.OS === 'web' && navigator?.clipboard) {
      navigator.clipboard.writeText(summary);
    }
    Alert.alert('Copied to Clipboard!', summary);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Portfolio Overview Summary Cards */}
      <View style={styles.overviewGrid}>
        <View style={styles.overviewCard}>
          <Text style={styles.overviewLabel}>Locked Collateral</Text>
          <Text style={styles.overviewValPrimary}>${totalCollateral.toLocaleString()}</Text>
          <Text style={styles.overviewSub}>{trades.length} Active Position{trades.length !== 1 ? 's' : ''}</Text>
        </View>

        <View style={styles.overviewCard}>
          <Text style={styles.overviewLabel}>Net Premium Collected</Text>
          <Text style={styles.overviewValSuccess}>+${totalPremium.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          <Text style={styles.overviewSub}>
            Avg ROC: {totalCollateral > 0 ? ((totalPremium / totalCollateral) * 100).toFixed(2) : '0.00'}%
          </Text>
        </View>
      </View>

      {/* Free Tier Limit Warning Banner */}
      {!isPremium && trades.length >= 3 && (
        <TouchableOpacity style={styles.paywallBanner} onPress={onOpenPaywall} activeOpacity={0.85}>
          <LinearGradient colors={['#7C3AED', '#4C1D95']} style={styles.bannerGradient}>
            <Crown color="#F59E0B" size={24} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>Free Tier Capacity Reached (3/3)</Text>
              <Text style={styles.bannerSub}>Upgrade to Pro for unlimited trades & expiration alerts.</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Filter Tabs */}
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
          <Text style={[styles.filterChipText, selectedFilter === 'itm' && styles.filterTextActive]}>ITM Risk</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, selectedFilter === 'expiring' && styles.filterChipActive]}
          onPress={() => setSelectedFilter('expiring')}
        >
          <Text style={[styles.filterChipText, selectedFilter === 'expiring' && styles.filterTextActive]}>Expiring Soon</Text>
        </TouchableOpacity>
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
          const isITM = trade.strikePrice > trade.stockPrice;
          const effectiveCost = (trade.strikePrice - trade.premium).toFixed(2);
          const netIncome = (trade.premium * 100 * trade.contracts - trade.commissions).toFixed(2);
          const collateral = trade.strikePrice * 100 * trade.contracts;

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
                </View>

                <View style={styles.dteBadge}>
                  <Clock color="#94A3B8" size={12} style={{ marginRight: 4 }} />
                  <Text style={styles.dteText}>{trade.dte} Days Left</Text>
                </View>
              </View>

              <View style={styles.tradeGrid}>
                <View style={styles.tradeCol}>
                  <Text style={styles.tradeLabel}>Strike / Stock</Text>
                  <Text style={styles.tradeVal}>${trade.strikePrice.toFixed(2)} / ${trade.stockPrice.toFixed(2)}</Text>
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

                <TouchableOpacity style={styles.launchBtn} onPress={handleLaunchCoveredProfit} activeOpacity={0.85}>
                  <LinearGradient colors={['#10B981', '#059669']} style={styles.launchGradient}>
                    <ExternalLink color="#FFF" size={18} style={{ marginRight: 8 }} />
                    <Text style={styles.launchBtnText}>Open CoveredProfit App</Text>
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
  filterRow: {
    flexDirection: 'row',
    marginBottom: 16,
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
});