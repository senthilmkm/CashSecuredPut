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
} from 'lucide-react-native';

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
}

export default function WheelHub({ onOpenPaywall, isPremium }: WheelHubProps) {
  const [positions, setPositions] = useState<WheelPosition[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
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

  useEffect(() => {
    loadPositions();
  }, []);

  const loadPositions = async () => {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY_WHEEL);
      if (json) {
        setPositions(JSON.parse(json));
      } else {
        // Populate sample Wheel position to show users how it works
        const sample: WheelPosition[] = [
          {
            id: 'sample_1',
            ticker: 'AAPL',
            phase: 'covered_call',
            initialStrike: 220,
            initialPutPremium: 4.5,
            shares: 100,
            assignedDate: '2026-08-15',
            assignedPrice: 220,
            coveredCallsSold: [
              {
                id: 'cc_1',
                strike: 225,
                premium: 3.8,
                dte: 24,
                dateSold: '2026-09-01',
                status: 'active',
              },
            ],
            notes: 'CSP assigned at $220. Selling OTM covered calls to reduce cost basis.',
          },
        ];
        setPositions(sample);
        await AsyncStorage.setItem(STORAGE_KEY_WHEEL, JSON.stringify(sample));
      }
    } catch (e) {
      console.warn('Failed to load wheel positions', e);
    } finally {
      setLoading(false);
    }
  };

  const savePositions = async (updated: WheelPosition[]) => {
    try {
      setPositions(updated);
      await AsyncStorage.setItem(STORAGE_KEY_WHEEL, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save wheel positions', e);
    }
  };

  const handleCreatePosition = async () => {
    const t = newTicker.trim().toUpperCase();
    const s = parseFloat(newStrike);
    const p = parseFloat(newPutPremium);
    const sh = parseInt(newShares, 10) || 100;

    if (!t || isNaN(s) || s <= 0 || isNaN(p) || p <= 0) {
      Alert.alert('Invalid Input', 'Please enter valid ticker, strike, and premium.');
      return;
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

  // Helper calculations
  const calculateWheelSummary = (pos: WheelPosition) => {
    const putTotalPrem = pos.initialPutPremium * pos.shares;
    const ccTotalPrem = pos.coveredCallsSold.reduce((sum, c) => sum + c.premium * pos.shares, 0);
    const totalIncome = putTotalPrem + ccTotalPrem;

    const initialCostBasisPerShare = pos.initialStrike - pos.initialPutPremium;
    const currentNetCostBasisPerShare = Math.max(0, pos.initialStrike - (totalIncome / pos.shares));
    const totalCapitalLocked = pos.initialStrike * pos.shares;
    const overallRocPercent = (totalIncome / totalCapitalLocked) * 100;

    return {
      totalIncome,
      initialCostBasisPerShare,
      currentNetCostBasisPerShare,
      totalCapitalLocked,
      overallRocPercent,
      ccCount: pos.coveredCallsSold.length,
    };
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
          <Text style={styles.sectionHeader}>Active Wheel Ledgers ({positions.length})</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.85}
          >
            <Plus size={16} color="#FFF" style={{ marginRight: 4 }} />
            <Text style={styles.addBtnText}>Start New Wheel</Text>
          </TouchableOpacity>
        </View>

        {/* WHEEL POSITIONS LIST */}
        {positions.length > 0 ? (
          positions.map((pos) => {
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
                      ]}
                    >
                      <Text style={styles.phaseBadgeText}>
                        {pos.phase === 'csp' && 'Phase 1: Cash-Secured Put'}
                        {pos.phase === 'assigned_shares' && 'Phase 2: Assigned Shares'}
                        {pos.phase === 'covered_call' && `Phase 3: Selling CCs (${summary.ccCount})`}
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
                    <Text style={styles.cellValueSuccess}>+${pos.initialPutPremium.toFixed(2)}/sh</Text>
                    <Text style={styles.cellSub}>+${(pos.initialPutPremium * pos.shares).toFixed(0)}</Text>
                  </View>

                  <View style={styles.ledgerCell}>
                    <Text style={styles.cellLabel}>Total Income</Text>
                    <Text style={styles.cellValueSuccess}>+${summary.totalIncome.toFixed(0)}</Text>
                    <Text style={styles.cellSub}>ROC: {summary.overallRocPercent.toFixed(1)}%</Text>
                  </View>

                  <View style={styles.ledgerCell}>
                    <Text style={styles.cellLabel}>Net Cost Basis</Text>
                    <Text style={styles.cellValueNet}>${summary.currentNetCostBasisPerShare.toFixed(2)}</Text>
                    <Text style={styles.cellSub}>Per share</Text>
                  </View>
                </View>

                {/* Covered Call Log Sub-List */}
                {pos.coveredCallsSold.length > 0 && (
                  <View style={styles.ccSubBox}>
                    <Text style={styles.ccSubTitle}>Covered Calls Logged:</Text>
                    {pos.coveredCallsSold.map((cc, i) => (
                      <View key={cc.id || i} style={styles.ccRow}>
                        <Text style={styles.ccText}>• Sold ${cc.strike} Call ({cc.dte} DTE)</Text>
                        <Text style={styles.ccPrem}>+${cc.premium.toFixed(2)}/sh (+${(cc.premium * pos.shares).toFixed(0)})</Text>
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
                      <Text style={styles.transitionBtnText}>Mark Assigned $\rightarrow$ Enter Phase 2</Text>
                    </TouchableOpacity>
                  )}

                  {(pos.phase === 'assigned_shares' || pos.phase === 'covered_call') && (
                    <TouchableOpacity
                      style={styles.addCcBtn}
                      onPress={() => {
                        setSelectedPosition(pos);
                        setCcStrike((pos.initialStrike * 1.05).toFixed(2));
                        setCcPremium('2.50');
                        setCcModalVisible(true);
                      }}
                    >
                      <Plus size={15} color="#3B82F6" style={{ marginRight: 6 }} />
                      <Text style={styles.addCcBtnText}>+ Sell New Covered Call</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <RotateCcw size={36} color="#64748B" style={{ marginBottom: 10 }} />
            <Text style={styles.emptyTitle}>No Active Wheel Strategy Positions</Text>
            <Text style={styles.emptySub}>
              Start a Cash-Secured Put, track assignments, and automatically record Covered Calls to continuously lower your stock cost basis.
            </Text>
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

              <TouchableOpacity style={styles.confirmBtn} onPress={handleCreatePosition}>
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
  ccRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  ccText: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  ccPrem: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '700',
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
});
