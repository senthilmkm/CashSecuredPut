import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RefreshCw, ArrowRight, DollarSign, Crown, Info, CheckCircle2 } from 'lucide-react-native';
import { calculateRollCSP, RollSimulationResult } from '../services/cspMath';

interface RollSimulatorProps {
  initialData?: any;
  onExecuteRoll?: (originalTradeId: string, rollDetails: any) => Promise<{ success: boolean; paywallTriggered?: boolean }>;
  onOpenPaywall: () => void;
  isPremium: boolean;
}

export default function RollSimulator({
  initialData,
  onExecuteRoll,
  onOpenPaywall,
  isPremium,
}: RollSimulatorProps) {
  const [currentStrike, setCurrentStrike] = useState(initialData?.strikePrice ? initialData.strikePrice.toString() : '140.00');
  const [currentContracts, setCurrentContracts] = useState(initialData?.contracts ? initialData.contracts.toString() : '1');
  const [closeCost, setCloseCost] = useState('4.50');
  
  const [newStrike, setNewStrike] = useState(initialData?.strikePrice ? (initialData.strikePrice - 5).toString() : '135.00');
  const [newPremium, setNewPremium] = useState('6.20');
  const [newDte, setNewDte] = useState('30');

  const [rollResult, setRollResult] = useState<RollSimulationResult | null>(null);

  useEffect(() => {
    const res = calculateRollCSP({
      currentStrike: parseFloat(currentStrike) || 0,
      currentContracts: parseInt(currentContracts, 10) || 1,
      closeCostPerContract: parseFloat(closeCost) || 0,
      newStrike: parseFloat(newStrike) || 0,
      newPremiumPerContract: parseFloat(newPremium) || 0,
    });
    setRollResult(res);
  }, [currentStrike, currentContracts, closeCost, newStrike, newPremium]);

  const handleApplyRoll = async () => {
    if (!isPremium) {
      onOpenPaywall();
      return;
    }

    if (!initialData?.id || !onExecuteRoll) {
      Alert.alert('Simulation Only', 'You can simulate roll calculations here. To execute a roll on an active position, tap the Roll icon on the position card in your portfolio.');
      return;
    }

    const newExpirationDate = new Date(Date.now() + (parseInt(newDte, 10) || 30) * 86400000).toISOString().split('T')[0];

    const res = await onExecuteRoll(initialData.id, {
      newStrike: parseFloat(newStrike),
      newPremium: parseFloat(newPremium),
      newExpirationDate,
      newDte: parseInt(newDte, 10),
      closeDebitPerShare: parseFloat(closeCost),
    });

    if (res.paywallTriggered) {
      onOpenPaywall();
    } else if (res.success) {
      Alert.alert('Roll Executed!', 'Your CSP trade has been rolled down and out successfully.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Header Banner */}
      <View style={styles.headerCard}>
        <RefreshCw color="#3B82F6" size={24} style={{ marginBottom: 8 }} />
        <Text style={styles.headerTitle}>CSP Roll Down & Out Simulator</Text>
        <Text style={styles.headerDesc}>
          Adjust strike price and extend expiration to lock in a net credit when a stock moves down.
        </Text>
      </View>

      {/* Paywall Lock Ribbon for Free Users */}
      {!isPremium && (
        <TouchableOpacity style={styles.proRibbon} onPress={onOpenPaywall} activeOpacity={0.85}>
          <Crown color="#F59E0B" size={18} style={{ marginRight: 8 }} />
          <Text style={styles.proRibbonText}>Pro Feature: Unlock Full Roll Simulator & Execution</Text>
        </TouchableOpacity>
      )}

      {/* Inputs Comparison */}
      <View style={styles.compareGrid}>
        {/* Existing Contract */}
        <View style={styles.compareCol}>
          <Text style={styles.colHeaderTitle}>Existing Put Option</Text>
          
          <Text style={styles.inputLabel}>Current Strike ($)</Text>
          <TextInput
            style={styles.numInput}
            value={currentStrike}
            onChangeText={setCurrentStrike}
            keyboardType="numeric"
          />

          <Text style={styles.inputLabel}>Contracts</Text>
          <TextInput
            style={styles.numInput}
            value={currentContracts}
            onChangeText={setCurrentContracts}
            keyboardType="number-pad"
          />

          <Text style={styles.inputLabel}>Buyback Cost ($/sh)</Text>
          <TextInput
            style={styles.numInput}
            value={closeCost}
            onChangeText={setCloseCost}
            keyboardType="numeric"
          />
        </View>

        {/* New Contract */}
        <View style={styles.compareCol}>
          <Text style={styles.colHeaderTitle}>New Put Option</Text>
          
          <Text style={styles.inputLabel}>New Strike ($)</Text>
          <TextInput
            style={styles.numInput}
            value={newStrike}
            onChangeText={setNewStrike}
            keyboardType="numeric"
          />

          <Text style={styles.inputLabel}>New Premium ($/sh)</Text>
          <TextInput
            style={styles.numInput}
            value={newPremium}
            onChangeText={setNewPremium}
            keyboardType="numeric"
          />

          <Text style={styles.inputLabel}>New DTE (Days)</Text>
          <TextInput
            style={styles.numInput}
            value={newDte}
            onChangeText={setNewDte}
            keyboardType="number-pad"
          />
        </View>
      </View>

      {/* Simulation Outcome Cards */}
      {rollResult && (
        <View style={styles.outcomeCard}>
          <Text style={styles.outcomeTitle}>Roll Transaction Outcome</Text>
          
          <View style={styles.outcomeRow}>
            <Text style={styles.outcomeLabel}>Close Buyback Debit:</Text>
            <Text style={styles.textDanger}>-${rollResult.closeDebitTotal.toFixed(2)}</Text>
          </View>

          <View style={styles.outcomeRow}>
            <Text style={styles.outcomeLabel}>New Premium Credit:</Text>
            <Text style={styles.textSuccess}>+${rollResult.newCreditTotal.toFixed(2)}</Text>
          </View>

          <View style={[styles.outcomeRow, styles.outcomeHighlightRow]}>
            <Text style={styles.outcomeHighlightLabel}>Net Credit / Debit:</Text>
            <Text style={[styles.outcomeHighlightVal, rollResult.isNetCredit ? styles.textSuccess : styles.textDanger]}>
              {rollResult.isNetCredit ? '+' : ''}${rollResult.netCreditOrDebit.toFixed(2)}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.outcomeRow}>
            <Text style={styles.outcomeLabel}>New Collateral Required:</Text>
            <Text style={styles.textPrimary}>${rollResult.newCollateralRequired.toLocaleString()}</Text>
          </View>

          <View style={styles.outcomeRow}>
            <Text style={styles.outcomeLabel}>New Effective Cost Basis:</Text>
            <Text style={styles.textSuccess}>${rollResult.newEffectiveCostBasis.toFixed(2)}/share</Text>
          </View>

          {initialData?.id && (
            <TouchableOpacity style={styles.applyBtn} onPress={handleApplyRoll} activeOpacity={0.85}>
              <LinearGradient colors={['#3B82F6', '#1D4ED8']} style={styles.applyGradient}>
                <Text style={styles.applyBtnText}>Execute Roll Transaction</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      )}
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
  headerCard: {
    backgroundColor: '#161E2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  headerDesc: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  proRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#451A03',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#D97706',
  },
  proRibbonText: {
    color: '#F59E0B',
    fontWeight: '700',
    fontSize: 13,
  },
  compareGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  compareCol: {
    width: '48%',
    backgroundColor: '#161E2E',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  colHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 4,
  },
  numInput: {
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#F8FAFC',
    paddingHorizontal: 10,
    height: 38,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  outcomeCard: {
    backgroundColor: '#161E2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  outcomeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 14,
  },
  outcomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  outcomeLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  outcomeHighlightRow: {
    backgroundColor: '#0B0F19',
    padding: 10,
    borderRadius: 10,
    marginVertical: 6,
  },
  outcomeHighlightLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  outcomeHighlightVal: {
    fontSize: 16,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 10,
  },
  textSuccess: {
    color: '#10B981',
    fontWeight: '700',
  },
  textDanger: {
    color: '#EF4444',
    fontWeight: '700',
  },
  textPrimary: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  applyBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 14,
  },
  applyGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 15,
  },
});