import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FREE_TIER_COPY } from '../services/freeTierQuota';
import { LinearGradient } from 'expo-linear-gradient';
import {
  RotateCcw,
  Plus,
  ArrowRight,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Trash2,
  HelpCircle,
  Sparkles,
  Crown,
  ChevronRight,
  Trophy,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { getMarketQuote } from '../services/publicApi';

export interface WheelPosition {
  id: string;
  ticker: string;
  phase: 'csp' | 'assigned_shares' | 'covered_call' | 'completed';
  initialStrike: number;
  initialPutPremium: number; // per share
  shares: number; // usually 100
  assignedDate?: string;
  assignedPrice?: number;
  coveredCallsSold: {
    id: string;
    strike: number;
    premium: number; // per share
    dte: number;
    dateSold: string;
    status: 'active' | 'expired' | 'assigned';
  }[];
  notes?: string;
}

const STORAGE_KEY_WHEEL = '@csp_wheel_positions_v1';

interface WheelHubProps {
  onOpenPaywall: () => void;
  isPremium: boolean;
  wheelUsed?: boolean;
  claimWheelSlot?: () => Promise<{ ok: boolean; paywall: boolean; message?: string }>;
  onExistingWheel?: (count: number) => void;
  existingSyncReady?: boolean;
}

export default function WheelHub({ onOpenPaywall, isPremium, wheelUsed = false, claimWheelSlot, onExistingWheel, existingSyncReady = false }: WheelHubProps) {
  const [positions, setPositions] = useState<WheelPosition[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [savingWheel, setSavingWheel] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<WheelPosition | null>(null);

  // Form states for new Wheel position
  const [newTicker, setNewTicker] = useState('NVDA');
  const [newStrike, setNewStrike] = useState('115.00');
  const [newPutPremium, setNewPutPremium] = useState('3.20');
  const [newShares, setNewShares] = useState('100');

  // Form states for adding Covered Call
  const [ccStrike, setCcStrike] = useState('');
  const [ccPremium, setCcPremium] = useState('');
  const [ccDte, setCcDte] = useState('30');
  const [ccModalVisible, setCcModalVisible] = useState(false);
  const [showCompletedArchive, setShowCompletedArchive] = useState(false);
  const [fetchingCcQuote, setFetchingCcQuote] = useState(false);

  const handleOpenAddCoveredCall = async (pos: WheelPosition) => {
    setSelectedPosition(pos);
    const fallbackStrike = (pos.initialStrike * 1.05).toFixed(2);
    setCcStrike(fallbackStrike);
    setCcPremium('2.50');
    setCcDte('30');
    setCcModalVisible(true);

    try {
      setFetchingCcQuote(true);
      const quote = await getMarketQuote(pos.ticker);
      if (quote && quote.price > 0) {
        // Automatically suggest 5% OTM Call strike based on live stock price
        const liveOtmStrike = (Math.round((quote.price * 1.05) * 2) / 2).toFixed(2);
        setCcStrike(liveOtmStrike);
      }
    } catch (e) {
      // Fallback
    } finally {
      setFetchingCcQuote(false);
    }
  };

  useEffect(() => {
    loadPositions();
  }, []);

  useEffect(() => {
    if (!loading && existingSyncReady && onExistingWheel) {
      onExistingWheel(positions.length);
    }
  }, [loading, positions.length, existingSyncReady]);

  const loadPositions = async () => {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY_WHEEL);
      let parsed: WheelPosition[] = [];
      if (json !== null) {
        try {
          const raw = JSON.parse(json);
          parsed = Array.isArray(raw) ? raw : [];
        } catch (e) {
          parsed = [];
        }
      }

      // Drop the old first-launch AAPL sample so it cannot occupy the free slot.
      const positionsWithoutSample = parsed.filter((position) => position?.id !== 'sample_1');
      if (json === null || positionsWithoutSample.length !== parsed.length) {
        await AsyncStorage.setItem(STORAGE_KEY_WHEEL, JSON.stringify(positionsWithoutSample));
      }
      await AsyncStorage.setItem('@csp_wheel_initialized', 'true');
      setPositions(positionsWithoutSample);
    } catch (e) {
      console.warn('Failed to load wheel positions', e);
    } finally {
      setLoading(false);
    }
  };

  const savePositions = async (updated: WheelPosition[]) => {
    try {
      setPositions(updated);
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEY_WHEEL, JSON.stringify(updated)),
        AsyncStorage.setItem('@csp_wheel_initialized', 'true'),
      ]);
    } catch (e) {
      console.warn('Failed to save wheel positions', e);
    }
  };

  const handleCreatePosition = async () => {
    if (savingWheel) {
      return;
    }
    if (!isPremium && wheelUsed) {
      setModalVisible(false);
      Alert.alert(FREE_TIER_COPY.wheelTitle, FREE_TIER_COPY.wheelBody, [
        { text: 'Unlock Pro', onPress: onOpenPaywall },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    const t = newTicker.trim().toUpperCase();
    const s = parseFloat(newStrike);
    const p = parseFloat(newPutPremium);
    const sh = parseInt(newShares, 10) || 100;

    if (!t || isNaN(s) || s <= 0 || isNaN(p) || p <= 0) {
      Alert.alert('Invalid Input', 'Please enter valid ticker, strike, and premium.');
      return;
    }

    setSavingWheel(true);
    try {
      if (!isPremium) {
        if (!claimWheelSlot) {
          Alert.alert('Save needs a connection', FREE_TIER_COPY.wheelOffline);
          return;
        }
        const claim = await claimWheelSlot();
        if (!claim.ok) {
          if (claim.paywall) {
            setModalVisible(false);
            Alert.alert(FREE_TIER_COPY.wheelTitle, FREE_TIER_COPY.wheelBody, [
              { text: 'Unlock Pro', onPress: onOpenPaywall },
              { text: 'Cancel', style: 'cancel' },
            ]);
          } else if (claim.message) {
            Alert.alert('Save needs a connection', claim.message);
          }
          return;
        }
      }

      const newPos: WheelPosition = {
        id: Date.now().toString(),
        ticker: t,
        phase: 'csp',
        initialStrike: s,
        initialPutPremium: p,
        shares: sh,
        coveredCallsSold: [],
      };

      const updated = [newPos, ...positions];
      await savePositions(updated);
      setModalVisible(false);
      Alert.alert('Wheel Position Started!', `${t} Cash-Secured Put logged in Wheel Suite.`);
    } finally {
      setSavingWheel(false);
    }
  };

  const handleTransitionToAssigned = async (pos: WheelPosition) => {
    const updated = positions.map((p) => {
      if (p.id === pos.id) {
        return {
          ...p,
          phase: 'assigned_shares' as const,
          assignedDate: new Date().toISOString().split('T')[0],
          assignedPrice: p.initialStrike,
        };
      }
      return p;
    });
    await savePositions(updated);
    Alert.alert('Stock Assigned!', `${pos.ticker} Put assigned. You now hold 100 shares. Next step: Sell Covered Calls!`);
  };

  const handleAddCoveredCall = async () => {
    if (!selectedPosition) return;
    const strike = parseFloat(ccStrike);
    const prem = parseFloat(ccPremium);
    const dte = parseInt(ccDte, 10) || 30;

    if (isNaN(strike) || strike <= 0 || isNaN(prem) || prem <= 0) {
      Alert.alert('Invalid Entry', 'Please enter valid Call Strike and Premium.');
      return;
    }

    const updated = positions.map((p) => {
      if (p.id === selectedPosition.id) {
        const newCC = {
          id: Date.now().toString(),
          strike,
          premium: prem,
          dte,
          dateSold: new Date().toISOString().split('T')[0],
          status: 'active' as const,
        };
        return {
          ...p,
          phase: 'covered_call' as const,
          coveredCallsSold: [...p.coveredCallsSold, newCC],
        };
      }
      return p;
    });

    await savePositions(updated);
    setCcModalVisible(false);
    setCcStrike('');
    setCcPremium('');
    Alert.alert('Covered Call Added!', `Sold \$${strike} Covered Call on ${selectedPosition.ticker} for +\$${prem}/sh credit.`);
  };

  const handleDeletePosition = (id: string) => {
    Alert.alert('Delete Wheel Position', 'Are you sure you want to delete this position?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = positions.filter((p) => p.id !== id);
          await savePositions(updated);
        },
      },
    ]);
  };

  const handleUpdateCCStatus = async (
    posId: string,
    ccId: string,
    newStatus: 'expired' | 'assigned'
  ) => {
    const updated = positions.map((p) => {
      if (p.id === posId) {
        const updatedCCs = p.coveredCallsSold.map((c) => (c.id === ccId ? { ...c, status: newStatus } : c));
        const isAssigned = newStatus === 'assigned';
        return {
          ...p,
          phase: isAssigned ? ('completed' as const) : ('covered_call' as const),
          coveredCallsSold: updatedCCs,
        };
      }
      return p;
    });

    await savePositions(updated);

    if (newStatus === 'assigned') {
      Alert.alert(
        '🏆 Wheel Strategy Completed!',
        'Your shares were called away at the Call Strike! Full Wheel cycle profit is realized and locked.'
      );
    } else {
      Alert.alert('Call Expired Worthless', 'Kept 100% call premium. You can now sell another Covered Call!');
    }
  };

  const handleRestartWheel = (posId: string) => {
    Alert.alert(
      'Restart Wheel Cycle?',
      'Reset this position back to Phase 1 (Cash-Secured Put) to begin a fresh Wheel cycle?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restart Wheel',
          onPress: async () => {
            const updated = positions.map((p) => {
              if (p.id === posId) {
                return {
                  ...p,
                  phase: 'csp' as const,
                  coveredCallsSold: [],
                };
              }
              return p;
            });
            await savePositions(updated);
          },
        },
      ]
    );
  };

  const handleCompleteWheelManually = (posId: string) => {
    Alert.alert(
      'Complete Wheel Position?',
      'Mark this entire Wheel cycle as completed? This will lock in your total realized income.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete Wheel',
          onPress: async () => {
            const updated = positions.map((p) =>
              p.id === posId ? { ...p, phase: 'completed' as const } : p
            );
            await savePositions(updated);
          },
        },
      ]
    );
  };

  // Helper calculations with zero-division protection
  const calculateWheelSummary = (pos: WheelPosition) => {
    const shares = Math.max(1, pos.shares || 100);
    const putTotalPrem = (pos.initialPutPremium || 0) * shares;
    const ccTotalPrem = (pos.coveredCallsSold || []).reduce((sum, c) => sum + (c.premium || 0) * shares, 0);
    const totalIncome = putTotalPrem + ccTotalPrem;

    const initialCostBasisPerShare = Math.max(0, (pos.initialStrike || 0) - (pos.initialPutPremium || 0));
    const currentNetCostBasisPerShare = Math.max(0, (pos.initialStrike || 0) - totalIncome / shares);
    const totalCapitalLocked = (pos.initialStrike || 0) * shares;
    const overallRocPercent = totalCapitalLocked > 0 ? (totalIncome / totalCapitalLocked) * 100 : 0;

    // Assigned covered call capital gain
    const assignedCall = (pos.coveredCallsSold || []).find((c) => c.status === 'assigned');
    const capitalGain = assignedCall ? (assignedCall.strike - pos.initialStrike) * shares : 0;
    const totalRealizedPnl = totalIncome + capitalGain;

    return {
      shares,
      putTotalPrem,
      totalIncome,
      initialCostBasisPerShare,
      currentNetCostBasisPerShare,
      totalCapitalLocked,
      overallRocPercent,
      capitalGain,
      totalRealizedPnl,
      ccCount: (pos.coveredCallsSold || []).length,
    };
  };

  const activePositions = positions.filter((p) => p.phase !== 'completed');
  const completedPositions = positions.filter((p) => p.phase === 'completed');

  const renderPositionCard = (pos: WheelPosition) => {
    const summary = calculateWheelSummary(pos);
    return (
      <View key={pos.id} style={styles.posCard}>
        <View style={styles.posHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.posTicker}>{pos.ticker}</Text>
            <View style={styles.sharesTag}>
              <Text style={styles.sharesTagText}>{pos.shares} Shares</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={[
                styles.phaseBadge,
                pos.phase === 'csp' && styles.phaseCsp,
                pos.phase === 'assigned_shares' && styles.phaseAssigned,
                pos.phase === 'covered_call' && styles.phaseCc,
                pos.phase === 'completed' && styles.phaseCompleted,
              ]}
            >
              <Text style={styles.phaseBadgeText}>
                {pos.phase === 'csp' && 'Phase 1: Cash-Secured Put'}
                {pos.phase === 'assigned_shares' && 'Phase 2: Assigned Shares'}
                {pos.phase === 'covered_call' && `Phase 3: Selling Covered Calls (${summary.ccCount})`}
                {pos.phase === 'completed' && `🏆 Wheel Complete (+${summary.overallRocPercent.toFixed(1)}% Return)`}
              </Text>
            </View>

            <TouchableOpacity onPress={() => handleDeletePosition(pos.id)} style={{ marginLeft: 8 }}>
              <Trash2 size={16} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 4-Column Key Ledger Stats */}
        <View style={styles.ledgerGrid}>
          <View style={styles.ledgerCell}>
            <Text style={styles.cellLabel}>Strike / Collateral</Text>
            <Text style={styles.cellValuePrimary}>${pos.initialStrike.toFixed(2)}</Text>
            <Text style={styles.cellSub}>${summary.totalCapitalLocked.toLocaleString()}</Text>
          </View>

          <View style={styles.ledgerCell}>
            <Text style={styles.cellLabel}>Put Premium</Text>
            <Text style={styles.cellValueSuccess}>+${pos.initialPutPremium.toFixed(2)}</Text>
            <Text style={styles.cellSub}>+${summary.putTotalPrem.toFixed(0)} Total</Text>
          </View>

          <View style={styles.ledgerCell}>
            <Text style={styles.cellLabel}>Net Cost Basis</Text>
            <Text style={styles.cellValueSuccess}>${summary.currentNetCostBasisPerShare.toFixed(2)}</Text>
            <Text style={styles.cellSub}>Initial: ${summary.initialCostBasisPerShare.toFixed(2)}</Text>
          </View>

          <View style={styles.ledgerCell}>
            <Text style={styles.cellLabel}>Total Income / Return</Text>
            <Text style={styles.cellValueSuccess}>+${summary.totalIncome.toFixed(0)}</Text>
            <Text style={styles.cellSub}>+{summary.overallRocPercent.toFixed(1)}% Return</Text>
          </View>
        </View>

        {/* Completed Lifecycle Summary Banner */}
        {pos.phase === 'completed' && (
          <View style={styles.completedCelebrationBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <CheckCircle2 size={16} color="#10B981" style={{ marginRight: 6 }} />
              <Text style={styles.completedCelebrationTitle}>Wheel Strategy Completed Successfully!</Text>
            </View>
            <Text style={styles.completedCelebrationText}>
              Total Realized Gain: +${summary.totalRealizedPnl.toFixed(2)} (+${summary.overallRocPercent.toFixed(1)}% Return) across {summary.ccCount} Covered Call cycle{summary.ccCount !== 1 ? 's' : ''}.
            </Text>
          </View>
        )}

        {/* Covered Call Log Sub-List with Status & Actions */}
        {pos.coveredCallsSold.length > 0 && (
          <View style={styles.ccSubBox}>
            <Text style={styles.ccSubTitle}>Covered Calls Logged ({pos.coveredCallsSold.length}):</Text>
            {pos.coveredCallsSold.map((cc, i) => (
              <View key={cc.id || i} style={styles.ccItemCard}>
                <View style={styles.ccRow}>
                  <Text style={styles.ccText}>• Sold ${cc.strike} Call ({cc.dte} Days Left)</Text>
                  <Text style={styles.ccPrem}>+${cc.premium.toFixed(2)}/sh (+${(cc.premium * pos.shares).toFixed(0)})</Text>
                </View>

                <View style={styles.ccStatusRow}>
                  {cc.status === 'active' ? (
                    <View style={styles.ccActionBtnRow}>
                      <TouchableOpacity
                        style={styles.ccExpireBtn}
                        onPress={() => handleUpdateCCStatus(pos.id, cc.id, 'expired')}
                      >
                        <Text style={styles.ccExpireText}>Expire (100% Win)</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.ccAssignBtn}
                        onPress={() => handleUpdateCCStatus(pos.id, cc.id, 'assigned')}
                      >
                        <Text style={styles.ccAssignText}>Sold @ Strike (Called Away)</Text>
                      </TouchableOpacity>
                    </View>
                  ) : cc.status === 'expired' ? (
                    <View style={styles.statusPillExpired}>
                      <Text style={styles.statusPillTextExpired}>Expired Worthless</Text>
                    </View>
                  ) : (
                    <View style={styles.statusPillAssigned}>
                      <Text style={styles.statusPillTextAssigned}>Shares Called Away</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Transition Phase Action Bar */}
        <View style={styles.cardActions}>
          {pos.phase === 'csp' && (
            <TouchableOpacity
              style={styles.transitionBtn}
              onPress={() => handleTransitionToAssigned(pos)}
            >
              <CheckCircle2 size={15} color="#F59E0B" style={{ marginRight: 6 }} />
              <Text style={styles.transitionBtnText}>Mark Assigned → Enter Phase 2</Text>
            </TouchableOpacity>
          )}

          {(pos.phase === 'assigned_shares' || pos.phase === 'covered_call') && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <TouchableOpacity
                style={[styles.addCcBtn, { flex: 0.65 }]}
                onPress={() => handleOpenAddCoveredCall(pos)}
                activeOpacity={0.8}
              >
                <Plus size={15} color="#3B82F6" style={{ marginRight: 6 }} />
                <Text style={styles.addCcBtnText}>+ Sell Covered Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.manualCompleteBtn, { flex: 0.32 }]}
                onPress={() => handleCompleteWheelManually(pos.id)}
              >
                <Text style={styles.manualCompleteBtnText}>Complete</Text>
              </TouchableOpacity>
            </View>
          )}

          {pos.phase === 'completed' && (
            <TouchableOpacity
              style={styles.restartBtn}
              onPress={() => handleRestartWheel(pos.id)}
            >
              <RotateCcw size={15} color="#10B981" style={{ marginRight: 6 }} />
              <Text style={styles.restartBtnText}>Restart Wheel Cycle</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* HERO BANNER & WHEEL SUMMARY */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroTitle}>Option Wheel Strategy Suite</Text>
              <Text style={styles.heroSub}>CSP $\rightarrow$ Assignment $\rightarrow$ Covered Call Transition Ledger</Text>
            </View>
            <View style={styles.badgeWheel}>
              <RotateCcw size={14} color="#FFF" style={{ marginRight: 4 }} />
              <Text style={styles.badgeWheelText}>WHEEL HUB</Text>
            </View>
          </View>

          {/* 3-Step Wheel Graphic Diagram */}
          <View style={styles.wheelFlowRow}>
            <View style={[styles.flowStep, styles.flowStep1]}>
              <Text style={styles.stepNum}>1</Text>
              <Text style={styles.stepName}>Sell Put (CSP)</Text>
              <Text style={styles.stepDesc}>Collect Premium</Text>
            </View>
            <ArrowRight size={14} color="#64748B" />
            <View style={[styles.flowStep, styles.flowStep2]}>
              <Text style={styles.stepNum}>2</Text>
              <Text style={styles.stepName}>Assignment</Text>
              <Text style={styles.stepDesc}>Buy 100 Shares</Text>
            </View>
            <ArrowRight size={14} color="#64748B" />
            <View style={[styles.flowStep, styles.flowStep3]}>
              <Text style={styles.stepNum}>3</Text>
              <Text style={styles.stepName}>Sell Call (CC)</Text>
              <Text style={styles.stepDesc}>Lower Net Basis</Text>
            </View>
          </View>
        </View>

        {/* TOP ACTIONS ROW */}
        <View style={styles.actionsRow}>
          <Text style={styles.sectionHeader}>Active Wheel Ledgers ({activePositions.length})</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => {
              if (!isPremium && wheelUsed) {
                Alert.alert(FREE_TIER_COPY.wheelTitle, FREE_TIER_COPY.wheelBody, [
                  { text: 'Unlock Pro', onPress: onOpenPaywall },
                  { text: 'Cancel', style: 'cancel' },
                ]);
                return;
              }
              setModalVisible(true);
            }}
            activeOpacity={0.85}
          >
            {isPremium ? (
              <Plus size={16} color="#FFF" style={{ marginRight: 4 }} />
            ) : wheelUsed ? (
              <Crown size={16} color="#F59E0B" style={{ marginRight: 4 }} />
            ) : (
              <Plus size={16} color="#FFF" style={{ marginRight: 4 }} />
            )}
            <Text style={styles.addBtnText}>Start New Wheel</Text>
          </TouchableOpacity>
        </View>

        {/* Free Tier Wheel Capacity Banner */}
        {wheelUsed && (
          <TouchableOpacity style={styles.paywallBanner} onPress={onOpenPaywall} activeOpacity={0.85}>
            <LinearGradient colors={['#7C3AED', '#4C1D95']} style={styles.bannerGradient}>
              <Crown color="#F59E0B" size={24} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>{FREE_TIER_COPY.wheelTitle}</Text>
                <Text style={styles.bannerSub}>{FREE_TIER_COPY.wheelBody}</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* ACTIVE WHEEL POSITIONS LIST */}
        {activePositions.length > 0 ? (
          activePositions.map((pos) => renderPositionCard(pos))
        ) : (
          <View style={styles.emptyCard}>
            <RotateCcw size={36} color="#64748B" style={{ marginBottom: 10 }} />
            <Text style={styles.emptyTitle}>No Active Wheel Strategy Positions</Text>
            <Text style={styles.emptySub}>
              {wheelUsed ? FREE_TIER_COPY.wheelEmptyUsed : FREE_TIER_COPY.wheelEmptyOpen}
            </Text>
          </View>
        )}

        {/* COMPLETED WHEEL ARCHIVE DRAWER */}
        {completedPositions.length > 0 && (
          <View style={styles.archiveContainer}>
            <TouchableOpacity
              style={styles.archiveHeaderBtn}
              onPress={() => setShowCompletedArchive(!showCompletedArchive)}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Trophy size={16} color="#F59E0B" style={{ marginRight: 8 }} />
                <Text style={styles.archiveHeaderText}>
                  Completed Wheels Archive ({completedPositions.length})
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.archiveToggleText}>
                  {showCompletedArchive ? 'Hide' : 'View'}
                </Text>
                {showCompletedArchive ? (
                  <ChevronUp size={14} color="#60A5FA" style={{ marginLeft: 4 }} />
                ) : (
                  <ChevronDown size={14} color="#60A5FA" style={{ marginLeft: 4 }} />
                )}
              </View>
            </TouchableOpacity>

            {showCompletedArchive && (
              <View style={{ marginTop: 10 }}>
                {completedPositions.map((pos) => renderPositionCard(pos))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* MODAL 1: START NEW WHEEL POSITION */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Start New Wheel Strategy</Text>
            
            <Text style={styles.inputLabel}>Ticker Symbol</Text>
            <TextInput style={styles.textInput} value={newTicker} onChangeText={setNewTicker} autoCapitalize="characters" />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ width: '48%' }}>
                <Text style={styles.inputLabel}>Put Strike ($)</Text>
                <TextInput style={styles.textInput} value={newStrike} onChangeText={setNewStrike} keyboardType="numeric" />
              </View>
              <View style={{ width: '48%' }}>
                <Text style={styles.inputLabel}>Put Premium ($/sh)</Text>
                <TextInput style={styles.textInput} value={newPutPremium} onChangeText={setNewPutPremium} keyboardType="numeric" />
              </View>
            </View>

            <Text style={styles.inputLabel}>Number of Shares</Text>
            <TextInput style={styles.textInput} value={newShares} onChangeText={setNewShares} keyboardType="number-pad" />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.confirmBtn, savingWheel && { opacity: 0.7 }]} onPress={handleCreatePosition} disabled={savingWheel}>
                <Text style={styles.confirmBtnText}>Create Wheel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: ADD COVERED CALL */}
      <Modal visible={ccModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Record Covered Call for {selectedPosition?.ticker}</Text>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ width: '48%' }}>
                <Text style={styles.inputLabel}>Call Strike ($)</Text>
                <TextInput style={styles.textInput} value={ccStrike} onChangeText={setCcStrike} keyboardType="numeric" />
              </View>
              <View style={{ width: '48%' }}>
                <Text style={styles.inputLabel}>Call Premium ($/sh)</Text>
                <TextInput style={styles.textInput} value={ccPremium} onChangeText={setCcPremium} keyboardType="numeric" />
              </View>
            </View>

            <Text style={styles.inputLabel}>Days to Expiration (DTE)</Text>
            <TextInput style={styles.textInput} value={ccDte} onChangeText={setCcDte} keyboardType="number-pad" />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCcModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.confirmBtn} onPress={handleAddCoveredCall}>
                <Text style={styles.confirmBtnText}>Add Call</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
  heroCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#F8FAFC',
  },
  heroSub: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  badgeWheel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeWheelText: {
    color: '#FFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  wheelFlowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  flowStep: {
    flex: 1,
    alignItems: 'center',
  },
  flowStep1: {},
  flowStep2: {},
  flowStep3: {},
  stepNum: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3B82F6',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    width: 20,
    height: 20,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 2,
  },
  stepName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  stepDesc: {
    fontSize: 9.5,
    color: '#94A3B8',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeader: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
  },
  addBtnText: {
    color: '#FFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  posCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  posHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  posTicker: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F8FAFC',
    marginRight: 8,
  },
  sharesTag: {
    backgroundColor: '#0B0F19',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sharesTagText: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '700',
  },
  phaseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
  },
  phaseCsp: {
    backgroundColor: '#065F46',
  },
  phaseAssigned: {
    backgroundColor: '#7C2D12',
  },
  phaseCc: {
    backgroundColor: '#1E3A8A',
  },
  phaseCompleted: {
    backgroundColor: '#064E3B',
  },
  phaseBadgeText: {
    color: '#FFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  ledgerGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    padding: 9,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  ledgerCell: {
    flex: 1,
    alignItems: 'center',
  },
  cellLabel: {
    fontSize: 9.5,
    color: '#64748B',
    marginBottom: 2,
    fontWeight: '600',
  },
  cellValuePrimary: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  cellValueSuccess: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
  },
  cellValueNet: {
    fontSize: 13,
    fontWeight: '900',
    color: '#3B82F6',
  },
  cellSub: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 1,
  },
  ccSubBox: {
    marginTop: 8,
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  ccSubTitle: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '700',
    marginBottom: 4,
  },
  ccItemCard: {
    backgroundColor: '#161E2E',
    borderRadius: 8,
    padding: 7,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  ccRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  ccText: {
    fontSize: 11,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  ccPrem: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '700',
  },
  ccStatusRow: {
    marginTop: 2,
  },
  ccActionBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
  },
  ccExpireBtn: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#059669',
  },
  ccExpireText: {
    color: '#A7F3D0',
    fontSize: 10,
    fontWeight: '700',
  },
  ccAssignBtn: {
    backgroundColor: '#451A03',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D97706',
  },
  ccAssignText: {
    color: '#FDE68A',
    fontSize: 10,
    fontWeight: '700',
  },
  statusPillExpired: {
    alignSelf: 'flex-start',
    backgroundColor: '#1E293B',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  statusPillTextExpired: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
  },
  statusPillAssigned: {
    alignSelf: 'flex-start',
    backgroundColor: '#451A03',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#B45309',
  },
  statusPillTextAssigned: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '800',
  },
  cardActions: {
    marginTop: 10,
  },
  transitionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#451A03',
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#7C2D12',
  },
  transitionBtnText: {
    color: '#F59E0B',
    fontWeight: '700',
    fontSize: 12.5,
  },
  manualCompleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#334155',
  },
  manualCompleteBtnText: {
    color: '#94A3B8',
    fontWeight: '700',
    fontSize: 12,
  },
  restartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#064E3B',
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  restartBtnText: {
    color: '#A7F3D0',
    fontWeight: '800',
    fontSize: 13,
  },
  addCcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#1E3A8A',
  },
  addCcBtnText: {
    color: '#3B82F6',
    fontWeight: '700',
    fontSize: 12.5,
  },
  emptyCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginTop: 10,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 15.5,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySub: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#161E2E',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 14,
  },
  inputLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 6,
  },
  textInput: {
    backgroundColor: '#0B0F19',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    height: 42,
    fontSize: 15,
    fontWeight: '700',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  cancelBtn: {
    flex: 0.45,
    backgroundColor: '#334155',
    paddingVertical: 11,
    borderRadius: 9,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13.5,
  },
  confirmBtn: {
    flex: 0.5,
    backgroundColor: '#10B981',
    paddingVertical: 11,
    borderRadius: 9,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 13.5,
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
  archiveContainer: {
    marginTop: 18,
    marginBottom: 20,
  },
  archiveHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161E2E',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  archiveHeaderText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  archiveToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#60A5FA',
  },
  completedCelebrationBanner: {
    backgroundColor: '#064E3B25',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#05966950',
  },
  completedCelebrationTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#34D399',
  },
  completedCelebrationText: {
    fontSize: 11,
    color: '#A7F3D0',
    lineHeight: 16,
  },
});
