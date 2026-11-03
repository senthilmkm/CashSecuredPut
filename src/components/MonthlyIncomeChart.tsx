import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TrendingUp, Target, Crown, Award, ChevronRight } from 'lucide-react-native';
import {
  MonthlyIncomeBucket,
  groupTradesByMonth,
  calculateGoalPacing,
} from '../services/incomeAnalytics';
import { CSPTrade } from '../services/storageUtils';

interface MonthlyIncomeChartProps {
  history: CSPTrade[];
  isPremium: boolean;
  onOpenPaywall: () => void;
  annualGoal?: number;
  onUpdateGoal?: (goal: number) => void;
}

export default function MonthlyIncomeChart({
  history,
  isPremium,
  onOpenPaywall,
  annualGoal = 5000,
  onUpdateGoal,
}: MonthlyIncomeChartProps) {
  const [selectedRange, setSelectedRange] = useState<6 | 12>(6);
  const buckets = groupTradesByMonth(history, selectedRange);

  // Default selected month to current (last) bucket
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(
    buckets[buckets.length - 1]?.monthKey || ''
  );

  const selectedBucket =
    buckets.find((b) => b.monthKey === selectedMonthKey) ||
    buckets[buckets.length - 1];

  const pacing = calculateGoalPacing(buckets, annualGoal);

  // Calculate highest income for scaling bar heights
  const maxIncome = Math.max(
    ...buckets.map((b) => b.netIncome),
    500 // minimum $500 ceiling for visual aesthetic
  );

  const CHART_HEIGHT = 130;

  return (
    <View style={styles.cardContainer}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <TrendingUp color="#10B981" size={18} style={{ marginRight: 6 }} />
          <Text style={styles.titleText}>Monthly Income Paycheck</Text>
        </View>

        {/* 6M vs 12M Range Switcher */}
        <View style={styles.rangeSelector}>
          <TouchableOpacity
            style={[styles.rangeBtn, selectedRange === 6 && styles.rangeBtnActive]}
            onPress={() => setSelectedRange(6)}
            activeOpacity={0.8}
          >
            <Text style={[styles.rangeBtnText, selectedRange === 6 && styles.rangeBtnTextActive]}>
              6M
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.rangeBtn, selectedRange === 12 && styles.rangeBtnActive]}
            onPress={() => {
              if (!isPremium) {
                onOpenPaywall();
              } else {
                setSelectedRange(12);
              }
            }}
            activeOpacity={0.8}
          >
            {!isPremium && <Crown size={10} color="#F59E0B" style={{ marginRight: 2 }} />}
            <Text style={[styles.rangeBtnText, selectedRange === 12 && styles.rangeBtnTextActive]}>
              12M
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Selected Month Highlight Detail Banner */}
      {selectedBucket && (
        <View style={styles.selectionBanner}>
          <View>
            <Text style={styles.selectionMonthLabel}>{selectedBucket.fullLabel}</Text>
            <Text style={styles.selectionIncomeText}>
              {selectedBucket.netIncome >= 0 ? '+' : ''}${selectedBucket.netIncome.toFixed(2)}
            </Text>
          </View>

          <View style={styles.selectionRight}>
            <View style={styles.winRateBadge}>
              <Award size={12} color="#10B981" style={{ marginRight: 4 }} />
              <Text style={styles.winRateText}>
                {selectedBucket.tradeCount > 0 ? `${selectedBucket.winRatePercent}% Win Rate` : 'No Trades'}
              </Text>
            </View>
            <Text style={styles.selectionTradeSub}>
              {selectedBucket.tradeCount} trade{selectedBucket.tradeCount !== 1 ? 's' : ''} (
              {selectedBucket.winCount} exp, {selectedBucket.assignedCount} asgd)
            </Text>
          </View>
        </View>
      )}

      {/* Bar Chart Graphics */}
      <View style={styles.chartWrapper}>
        <View style={[styles.barsContainer, { height: CHART_HEIGHT }]}>
          {buckets.map((b, index) => {
            const isSelected = b.monthKey === selectedBucket?.monthKey;
            const barHeightPercent = Math.max(
              b.netIncome > 0 ? (b.netIncome / maxIncome) * 100 : 4,
              4
            );
            const isLockedFreeMonth = !isPremium && index < buckets.length - 2;

            return (
              <TouchableOpacity
                key={b.monthKey}
                style={styles.barColumn}
                onPress={() => {
                  if (isLockedFreeMonth) {
                    onOpenPaywall();
                  } else {
                    setSelectedMonthKey(b.monthKey);
                  }
                }}
                activeOpacity={0.85}
              >
                {/* Bar Value Tooltip on Selected */}
                {isSelected && b.netIncome > 0 && (
                  <View style={styles.activeValueCap}>
                    <Text style={styles.activeValueText}>${Math.round(b.netIncome)}</Text>
                  </View>
                )}

                {/* Vertical Bar Graphic */}
                <View style={styles.barTrack}>
                  {b.netIncome > 0 ? (
                    <LinearGradient
                      colors={
                        isSelected
                          ? ['#34D399', '#10B981', '#059669']
                          : ['#10B981', '#047857']
                      }
                      style={[
                        styles.barFill,
                        {
                          height: `${barHeightPercent}%`,
                          opacity: isLockedFreeMonth ? 0.35 : 1,
                        },
                      ]}
                    />
                  ) : (
                    <View style={styles.barEmptyPill} />
                  )}
                </View>

                {/* X-Axis Month Label */}
                <Text
                  style={[
                    styles.barLabel,
                    isSelected && styles.barLabelActive,
                    isLockedFreeMonth && styles.barLabelLocked,
                  ]}
                >
                  {isLockedFreeMonth ? '🔒' : b.monthLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Pro Ribbon for Free Users */}
      {!isPremium && (
        <TouchableOpacity style={styles.proRibbon} onPress={onOpenPaywall} activeOpacity={0.85}>
          <Crown color="#F59E0B" size={14} style={{ marginRight: 6 }} />
          <Text style={styles.proRibbonText}>
            Unlock 12-Month Multi-Year Cash Flow & Tax Season P&L
          </Text>
          <ChevronRight size={14} color="#F59E0B" />
        </TouchableOpacity>
      )}

      {/* Annual Income Goal Progress Card */}
      <View style={styles.goalSection}>
        <View style={styles.goalTopRow}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center' }}
            onPress={() => {
              if (onUpdateGoal) {
                const presets = [2500, 5000, 10000, 25000, 50000];
                const currentIndex = presets.indexOf(annualGoal);
                const nextGoal = presets[(currentIndex + 1) % presets.length] || 5000;
                onUpdateGoal(nextGoal);
              }
            }}
            activeOpacity={0.7}
          >
            <Target size={14} color="#3B82F6" style={{ marginRight: 6 }} />
            <Text style={styles.goalTitle}>
              {new Date().getFullYear()} Target: ${annualGoal.toLocaleString()} ⟳
            </Text>
          </TouchableOpacity>
          <Text style={styles.goalPercentText}>{pacing.percentOfGoal}%</Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarTrack}>
          <LinearGradient
            colors={['#3B82F6', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressBarFill, { width: `${pacing.percentOfGoal}%` }]}
          />
        </View>

        {/* Pacing Velocity Stats */}
        <View style={styles.goalBottomRow}>
          <Text style={styles.goalSubText}>
            YTD Realized: <Text style={styles.textGreen}>+${pacing.totalYtd.toFixed(2)}</Text>
          </Text>
          <Text style={styles.goalSubText}>
            Paced for: <Text style={styles.textBlue}>~${pacing.projectedAnnual.toLocaleString()}/yr</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#161E2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  rangeSelector: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  rangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rangeBtnActive: {
    backgroundColor: '#3B82F6',
  },
  rangeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  rangeBtnTextActive: {
    color: '#FFF',
  },
  selectionBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  selectionMonthLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  selectionIncomeText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#10B981',
    marginTop: 2,
  },
  selectionRight: {
    alignItems: 'flex-end',
  },
  winRateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064E3B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  winRateText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6EE7B7',
  },
  selectionTradeSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  chartWrapper: {
    marginBottom: 12,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 18,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  activeValueCap: {
    position: 'absolute',
    top: -16,
    backgroundColor: '#10B981',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  activeValueText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#064E3B',
  },
  barTrack: {
    width: 22,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    width: '100%',
    borderRadius: 5,
  },
  barEmptyPill: {
    width: 14,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1E293B',
  },
  barLabel: {
    position: 'absolute',
    bottom: -18,
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  barLabelActive: {
    color: '#34D399',
    fontWeight: '800',
  },
  barLabelLocked: {
    fontSize: 9,
    color: '#475569',
  },
  proRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#271B07',
    borderWidth: 1,
    borderColor: '#78350F',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  proRibbonText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#FBBF24',
  },
  goalSection: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  goalTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  goalTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  goalPercentText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#34D399',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#1E293B',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  goalBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  goalSubText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  textGreen: {
    color: '#10B981',
    fontWeight: '700',
  },
  textBlue: {
    color: '#60A5FA',
    fontWeight: '700',
  },
});
