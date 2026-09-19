import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions } from 'react-native';
import Svg, { Path, Line, Circle, Rect, Text as SvgText, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { Sliders, HelpCircle } from 'lucide-react-native';

interface PayoffChartProps {
  stockPrice: number;
  strikePrice: number;
  premium: number;
  contracts: number;
}

export default function PayoffChart({
  stockPrice,
  strikePrice,
  premium,
  contracts = 1,
}: PayoffChartProps) {
  const [interactiveOffset, setInteractiveOffset] = useState<number>(0); // -20 to +20 % shift
  const [showTooltip, setShowTooltip] = useState<boolean>(false);

  const totalShares = Math.max(1, contracts) * 100;
  const breakeven = Math.max(0, strikePrice - premium);
  const maxProfitTotal = premium * totalShares;

  // Determine x-axis bounds (min stock price to max stock price)
  const minStock = Math.max(0, breakeven * 0.7);
  const maxStock = Math.max(strikePrice * 1.25, stockPrice * 1.2);
  const stockRange = maxStock - minStock || 1;

  // Selected evaluation stock price
  const baseEvalPrice = stockPrice > 0 ? stockPrice : strikePrice;
  const simulatedStockPrice = Math.max(0, baseEvalPrice * (1 + interactiveOffset / 100));

  // Compute P&L per share at a given stock price at expiration
  const getPayoffPerShare = (price: number) => {
    if (price >= strikePrice) {
      return premium; // Max profit
    }
    // Below strike: P&L = Premium - (Strike - StockPrice) = StockPrice - Breakeven
    return price - breakeven;
  };

  const simulatedPayoffPerShare = getPayoffPerShare(simulatedStockPrice);
  const simulatedPayoffTotal = simulatedPayoffPerShare * totalShares;

  // SVG Chart Dimensions
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = Math.min(screenWidth - 56, 360);
  const chartHeight = 160;
  const paddingX = 35;
  const paddingY = 25;

  const innerWidth = chartWidth - paddingX * 2;
  const innerHeight = chartHeight - paddingY * 2;

  // Map stock price to SVG X coordinate
  const getX = (price: number) => {
    const ratio = (price - minStock) / stockRange;
    return paddingX + Math.min(1, Math.max(0, ratio)) * innerWidth;
  };

  // P&L bounds
  const maxPl = premium * 1.3;
  const minPl = -(strikePrice - breakeven) * 1.5 || -premium * 3;
  const plRange = maxPl - minPl || 1;

  // Map P&L per share to SVG Y coordinate
  const getY = (pl: number) => {
    const ratio = (pl - minPl) / plRange;
    return chartHeight - paddingY - Math.min(1, Math.max(0, ratio)) * innerHeight;
  };

  const zeroY = getY(0);

  // Key coordinate points
  const pMin = { x: getX(minStock), y: getY(getPayoffPerShare(minStock)) };
  const pBreak = { x: getX(breakeven), y: getY(0) };
  const pStrike = { x: getX(strikePrice), y: getY(premium) };
  const pMax = { x: getX(maxStock), y: getY(premium) };
  const pCurrent = { x: getX(stockPrice), y: getY(getPayoffPerShare(stockPrice)) };
  const pSim = { x: getX(simulatedStockPrice), y: getY(simulatedPayoffPerShare) };

  // SVG Line path string
  const pathD = `M ${pMin.x} ${pMin.y} L ${pBreak.x} ${pBreak.y} L ${pStrike.x} ${pStrike.y} L ${pMax.x} ${pMax.y}`;

  // Profit shaded polygon (above zero Y line)
  const profitFillD = `M ${pBreak.x} ${zeroY} L ${pBreak.x} ${pBreak.y} L ${pStrike.x} ${pStrike.y} L ${pMax.x} ${pMax.y} L ${pMax.x} ${zeroY} Z`;

  // Loss shaded polygon (below zero Y line)
  const lossFillD = `M ${pMin.x} ${zeroY} L ${pMin.x} ${pMin.y} L ${pBreak.x} ${pBreak.y} L ${pBreak.x} ${zeroY} Z`;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.cardTitle}>Expiration P&L Payoff Visualizer</Text>
        <TouchableOpacity onPress={() => setShowTooltip(!showTooltip)}>
          <HelpCircle size={16} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {showTooltip && (
        <View style={styles.tooltipBox}>
          <Text style={styles.tooltipText}>
            • <Text style={{ color: '#10B981', fontWeight: '700' }}>Green Area:</Text> Profit zone (Stock stays above Breakeven ${breakeven.toFixed(2)}).{'\n'}
            • <Text style={{ color: '#EF4444', fontWeight: '700' }}>Red Area:</Text> Loss zone if assigned below net cost basis.{'\n'}
            • <Text style={{ color: '#3B82F6', fontWeight: '700' }}>Blue Marker:</Text> Current stock price (${stockPrice.toFixed(2)}).
          </Text>
        </View>
      )}

      {/* SVG Chart Container */}
      <View style={styles.chartWrapper}>
        <Svg width={chartWidth} height={chartHeight}>
          <Defs>
            <SvgLinearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
              <Stop offset="100%" stopColor="#10B981" stopOpacity="0.05" />
            </SvgLinearGradient>

            <SvgLinearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#EF4444" stopOpacity="0.05" />
              <Stop offset="100%" stopColor="#EF4444" stopOpacity="0.4" />
            </SvgLinearGradient>
          </Defs>

          {/* Shaded Areas */}
          <Path d={profitFillD} fill="url(#profitGrad)" />
          <Path d={lossFillD} fill="url(#lossGrad)" />

          {/* Zero P&L Reference Axis */}
          <Line x1={paddingX - 5} y1={zeroY} x2={chartWidth - paddingX + 5} y2={zeroY} stroke="#334155" strokeWidth="1" strokeDasharray="4,4" />

          {/* Breakeven Vertical Reference */}
          <Line x1={pBreak.x} y1={paddingY} x2={pBreak.x} y2={chartHeight - paddingY} stroke="#F59E0B" strokeWidth="1" strokeDasharray="3,3" />

          {/* Strike Price Vertical Reference */}
          <Line x1={pStrike.x} y1={paddingY} x2={pStrike.x} y2={chartHeight - paddingY} stroke="#64748B" strokeWidth="1" strokeDasharray="3,3" />

          {/* Main Payoff Line */}
          <Path d={pathD} stroke="#10B981" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />

          {/* Breakeven Point Dot */}
          <Circle cx={pBreak.x} cy={pBreak.y} r="5" fill="#F59E0B" stroke="#0B0F19" strokeWidth="2" />

          {/* Current Stock Price Line & Dot */}
          {stockPrice > 0 && (
            <>
              <Line x1={pCurrent.x} y1={paddingY - 5} x2={pCurrent.x} y2={chartHeight - paddingY + 5} stroke="#3B82F6" strokeWidth="1.5" />
              <Circle cx={pCurrent.x} cy={pCurrent.y} r="5" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="1.5" />
            </>
          )}

          {/* Simulated Stock Price Interactive Dot */}
          {interactiveOffset !== 0 && (
            <Circle cx={pSim.x} cy={pSim.y} r="6" fill="#A855F7" stroke="#FFFFFF" strokeWidth="2" />
          )}

          {/* Axis Labels */}
          <SvgText x={pBreak.x} y={chartHeight - 6} fill="#F59E0B" fontSize="9" fontWeight="bold" textAnchor="middle">
            BE: ${breakeven.toFixed(1)}
          </SvgText>

          <SvgText x={pStrike.x} y={paddingY - 8} fill="#94A3B8" fontSize="9" fontWeight="bold" textAnchor="middle">
            Strike: ${strikePrice.toFixed(1)}
          </SvgText>

          <SvgText x={chartWidth - paddingX + 2} y={getY(premium) + 4} fill="#10B981" fontSize="9" fontWeight="bold" textAnchor="start">
            +${maxProfitTotal.toFixed(0)}
          </SvgText>
        </Svg>
      </View>

      {/* Interactive Stock Expiration Simulator Slider Controls */}
      <View style={styles.simControls}>
        <View style={styles.simHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Sliders size={14} color="#A855F7" style={{ marginRight: 5 }} />
            <Text style={styles.simTitle}>Simulate Expiration Stock Price:</Text>
          </View>
          <Text style={styles.simValText}>${simulatedStockPrice.toFixed(2)}</Text>
        </View>

        <View style={styles.buttonScaleRow}>
          {[-10, -5, 0, 5, 10].map((step) => (
            <TouchableOpacity
              key={step}
              style={[
                styles.stepBtn,
                interactiveOffset === step && styles.stepBtnActive,
              ]}
              onPress={() => setInteractiveOffset(step)}
            >
              <Text
                style={[
                  styles.stepBtnText,
                  interactiveOffset === step && styles.stepBtnTextActive,
                ]}
              >
                {step === 0 ? 'Current' : `${step > 0 ? '+' : ''}${step}%`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Dynamic P&L Result Bar */}
        <View style={styles.pnlResultBox}>
          <Text style={styles.pnlResultLabel}>Expected P&L at ${simulatedStockPrice.toFixed(2)}:</Text>
          <Text style={[styles.pnlResultValue, simulatedPayoffTotal >= 0 ? styles.textSuccess : styles.textDanger]}>
            {simulatedPayoffTotal >= 0 ? '+' : ''}${simulatedPayoffTotal.toFixed(2)} ({simulatedPayoffPerShare >= 0 ? '+' : ''}${simulatedPayoffPerShare.toFixed(2)}/sh)
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  tooltipBox: {
    backgroundColor: '#0B0F19',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tooltipText: {
    color: '#94A3B8',
    fontSize: 11.5,
    lineHeight: 16,
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  simControls: {
    marginTop: 8,
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  simHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  simTitle: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },
  simValText: {
    color: '#A855F7',
    fontSize: 13,
    fontWeight: '800',
  },
  buttonScaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stepBtn: {
    backgroundColor: '#161E2E',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#334155',
    flex: 1,
    marginHorizontal: 2,
    alignItems: 'center',
  },
  stepBtnActive: {
    backgroundColor: '#A855F7',
    borderColor: '#C084FC',
  },
  stepBtnText: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '700',
  },
  stepBtnTextActive: {
    color: '#FFFFFF',
  },
  pnlResultBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  pnlResultLabel: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  pnlResultValue: {
    fontSize: 13,
    fontWeight: '900',
  },
  textSuccess: {
    color: '#10B981',
  },
  textDanger: {
    color: '#EF4444',
  },
});
