import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  RefreshCw,
  ArrowRight,
  DollarSign,
  Crown,
  Info,
  CheckCircle2,
  X,
  Sparkles,
  ChevronDown,
  Calendar,
  Check,
} from 'lucide-react-native';
import { calculateRollCSP, RollSimulationResult } from '../services/cspMath';
import { getPutOptionChain, CSPOptionContract } from '../services/publicApi';

interface RollSimulatorProps {
  initialData?: any;
  onExecuteRoll?: (originalTradeId: string, rollDetails: any) => Promise<{ success: boolean; paywallTriggered?: boolean }>;
  onOpenPaywall: () => void;
  isPremium: boolean;
  onDismissActiveTrade?: () => void;
  onRollSuccess?: () => void;
}

export default function RollSimulator({
  initialData,
  onExecuteRoll,
  onOpenPaywall,
  isPremium,
  onDismissActiveTrade,
  onRollSuccess,
}: RollSimulatorProps) {
  const [ticker, setTicker] = useState(initialData?.ticker || 'AAPL');
  const [currentStrike, setCurrentStrike] = useState(initialData?.strikePrice ? initialData.strikePrice.toString() : '140.00');
  const [currentContracts, setCurrentContracts] = useState(initialData?.contracts ? initialData.contracts.toString() : '1');
  const [closeCost, setCloseCost] = useState('4.50');
  
  const [newStrike, setNewStrike] = useState(initialData?.strikePrice ? (initialData.strikePrice - 5).toString() : '135.00');
  const [newPremium, setNewPremium] = useState('6.20');
  const [newDte, setNewDte] = useState('30');

  const [rollResult, setRollResult] = useState<RollSimulationResult | null>(null);
  const [optionChain, setOptionChain] = useState<CSPOptionContract[]>([]);
  const [uniqueExpirations, setUniqueExpirations] = useState<string[]>([]);
  const [selectedExpiration, setSelectedExpiration] = useState<string>('');
  
  const [showStrikeDropdown, setShowStrikeDropdown] = useState(false);
  const [showExpDropdown, setShowExpDropdown] = useState(false);

  const [fetchingLiveQuote, setFetchingLiveQuote] = useState(false);
  const [isLiveQuoteActive, setIsLiveQuoteActive] = useState(false);
  const [isCloseCostLive, setIsCloseCostLive] = useState(false);
  const [fetchingCloseCost, setFetchingCloseCost] = useState(false);

  const [isSyncingRoll, setIsSyncingRoll] = useState(false);
  const [syncingMessage, setSyncingMessage] = useState('Syncing live options chain...');
  const syncTimeoutRef = useRef<any>(null);

  // Displays a brief visual spinner feedback whenever presets or dropdowns repaint the screen
  const triggerSyncFeedback = (msg: string) => {
    setIsSyncingRoll(true);
    setSyncingMessage(msg);
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      setIsSyncingRoll(false);
    }, 750);
  };

  // Load option chain and auto-populate buyback price and new contract quotes
  const loadOptionChainData = async (tickerSym: string, stockNum: number, targetDteNum: number) => {
    try {
      setFetchingLiveQuote(true);
      setFetchingCloseCost(true);
      const chain = await getPutOptionChain(tickerSym, stockNum, targetDteNum);
      if (chain && chain.length > 0) {
        setOptionChain(chain);
        const uniqueExps = Array.from(new Set(chain.map((c) => c.expiration))).sort();
        setUniqueExpirations(uniqueExps);

        // Find closest matching expiration date
        let bestExp = uniqueExps[0];
        let minDiff = Infinity;
        for (const exp of uniqueExps) {
          const expTime = new Date(`${exp}T16:00:00Z`).getTime();
          const days = Math.max(1, Math.round((expTime - Date.now()) / (1000 * 60 * 60 * 24)));
          const diff = Math.abs(days - targetDteNum);
          if (diff < minDiff) {
            minDiff = diff;
            bestExp = exp;
          }
        }
        setSelectedExpiration(bestExp);

        // Auto-populate real-time buyback cost for existing strike
        const currStrikeNum = parseFloat(currentStrike) || (initialData?.strikePrice ? parseFloat(initialData.strikePrice) : 0);
        if (currStrikeNum > 0) {
          const existingContract = chain.find((c) => Math.abs(c.strike - currStrikeNum) < 0.1);
          if (existingContract && existingContract.premium > 0) {
            setCloseCost(existingContract.premium.toFixed(2));
            setIsCloseCostLive(!existingContract.isMocked);
          }
        }

        // Auto-populate new contract premium for selected strike & expiration
        const targetNewStrikeNum = parseFloat(newStrike) || (currStrikeNum > 0 ? Math.max(1, currStrikeNum - 5) : 0);
        const expContracts = chain.filter((c) => c.expiration === bestExp);
        const candidates = expContracts.length > 0 ? expContracts : chain;
        const matched = candidates.reduce((prev, curr) =>
          Math.abs(curr.strike - targetNewStrikeNum) < Math.abs(prev.strike - targetNewStrikeNum) ? curr : prev
        );
        if (matched && matched.premium > 0) {
          setNewStrike(matched.strike.toFixed(2));
          setNewPremium(matched.premium.toFixed(2));
          setIsLiveQuoteActive(!matched.isMocked);
        }
      }
    } catch (e) {
      // Fallback preserves initial data
    } finally {
      setFetchingLiveQuote(false);
      setFetchingCloseCost(false);
    }
  };

  // Synchronizes live market quote when preset adjustments or DTE changes occur
  const syncLiveRollQuote = async (targetStrike: number, targetDte: number, message: string) => {
    setIsSyncingRoll(true);
    setSyncingMessage(message);
    try {
      const tickerSym = initialData?.ticker || ticker || 'AAPL';
      const stockNum = initialData?.stockPrice || parseFloat(currentStrike) || 100;
      
      let chain = optionChain;
      if (tickerSym) {
        const fetchedChain = await getPutOptionChain(tickerSym, stockNum, targetDte);
        if (fetchedChain && fetchedChain.length > 0) {
          chain = fetchedChain;
          setOptionChain(fetchedChain);
          const uniqueExps = Array.from(new Set(fetchedChain.map((c) => c.expiration))).sort();
          setUniqueExpirations(uniqueExps);
        }
      }

      if (chain && chain.length > 0) {
        const uniqueExps = Array.from(new Set(chain.map((c) => c.expiration))).sort();
        let bestExp = uniqueExps[0];
        let minDiff = Infinity;
        for (const exp of uniqueExps) {
          const expTime = new Date(`${exp}T16:00:00Z`).getTime();
          const days = Math.max(1, Math.round((expTime - Date.now()) / (1000 * 60 * 60 * 24)));
          const diff = Math.abs(days - targetDte);
          if (diff < minDiff) {
            minDiff = diff;
            bestExp = exp;
          }
        }
        setSelectedExpiration(bestExp);

        const expTime = new Date(`${bestExp}T16:00:00Z`).getTime();
        const actualDte = Math.max(1, Math.round((expTime - Date.now()) / (1000 * 60 * 60 * 24)));
        setNewDte(actualDte.toString());

        const expContracts = chain.filter((c) => c.expiration === bestExp);
        const candidates = expContracts.length > 0 ? expContracts : chain;
        const matched = candidates.reduce((prev, curr) =>
          Math.abs(curr.strike - targetStrike) < Math.abs(prev.strike - targetStrike) ? curr : prev
        );

        if (matched && matched.premium > 0) {
          setNewStrike(matched.strike.toFixed(2));
          setNewPremium(matched.premium.toFixed(2));
          setIsLiveQuoteActive(!matched.isMocked);
        }
      } else {
        setNewStrike(targetStrike.toFixed(2));
        setNewDte(targetDte.toString());
        const basePrem = parseFloat(initialData?.premium || '3.50');
        const dteRatio = Math.sqrt(Math.max(1, targetDte) / 30);
        setNewPremium((basePrem * dteRatio).toFixed(2));
      }
    } catch (err) {
      setNewStrike(targetStrike.toFixed(2));
      setNewDte(targetDte.toString());
    } finally {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        setIsSyncingRoll(false);
      }, 750);
    }
  };

  const handleSelectStrike = (contract: CSPOptionContract) => {
    setShowStrikeDropdown(false);
    triggerSyncFeedback(`Selected $${contract.strike.toFixed(2)} Strike — Quote updated`);
    setNewStrike(contract.strike.toFixed(2));
    setNewPremium(contract.premium.toFixed(2));
    setIsLiveQuoteActive(!contract.isMocked);
  };

  const handleSelectExpiration = async (exp: string) => {
    setShowExpDropdown(false);
    const expTime = new Date(`${exp}T16:00:00Z`).getTime();
    const calculatedDte = Math.max(1, Math.round((expTime - Date.now()) / (1000 * 60 * 60 * 24)));
    setSelectedExpiration(exp);
    setNewDte(calculatedDte.toString());

    triggerSyncFeedback(`Updating ${exp} (${calculatedDte}d) options chain...`);

    const currentStrikeTarget = parseFloat(newStrike) || parseFloat(currentStrike) || 100;
    const expContracts = optionChain.filter((c) => c.expiration === exp);
    if (expContracts.length > 0) {
      const matched = expContracts.reduce((prev, curr) =>
        Math.abs(curr.strike - currentStrikeTarget) < Math.abs(prev.strike - currentStrikeTarget) ? curr : prev
      );
      if (matched) {
        setNewStrike(matched.strike.toFixed(2));
        setNewPremium(matched.premium.toFixed(2));
        setIsLiveQuoteActive(!matched.isMocked);
      }
    }
  };


  // Sync state when initialData changes or on initial screen mount
  useEffect(() => {
    const activeTicker = initialData?.ticker || ticker || 'AAPL';
    const initStrike = initialData?.strikePrice ? parseFloat(initialData.strikePrice) : 140;
    const initContracts = initialData?.contracts ? parseInt(initialData.contracts, 10) : 1;
    const initPrem = initialData?.premium ? parseFloat(initialData.premium) : 3.8;
    const rolledStrike = Math.max(1, initStrike - 5);
    const initDte = initialData?.dte ? parseInt(initialData.dte, 10) : 30;

    if (initialData?.ticker) {
      setTicker(initialData.ticker);
    }
    setCurrentStrike(initStrike.toFixed(2));
    setNewStrike(rolledStrike.toFixed(2));
    setCurrentContracts(initContracts.toString());
    setCloseCost((initPrem * 1.2).toFixed(2));
    setNewDte(initDte.toString());

    const stockNum = initialData?.stockPrice || initStrike;
    loadOptionChainData(activeTicker, stockNum, initDte);
  }, [initialData]);

  const handleSelectQuickTicker = (sym: string) => {
    setTicker(sym);
    const targetStrike = sym === 'NVDA' ? 120 : sym === 'TSLA' ? 220 : sym === 'MSFT' ? 410 : sym === 'SPY' ? 570 : 140;
    setCurrentStrike(targetStrike.toFixed(2));
    setNewStrike((targetStrike - 5).toFixed(2));
    triggerSyncFeedback(`Fetching live ${sym} options chain...`);
    loadOptionChainData(sym, targetStrike, parseInt(newDte, 10) || 30);
  };

  // Filter strikes for the currently selected expiration date
  const availableStrikes = useMemo(() => {
    if (!selectedExpiration) return optionChain;
    return optionChain.filter((c) => c.expiration === selectedExpiration).sort((a, b) => b.strike - a.strike);
  }, [optionChain, selectedExpiration]);

  useEffect(() => {
    const originalPrem = initialData?.cumulativeCostBasisCredit || initialData?.cumulativePremium || initialData?.premium || 0;
    const res = calculateRollCSP({
      currentStrike: parseFloat(currentStrike) || 0,
      currentContracts: parseInt(currentContracts, 10) || 1,
      closeCostPerContract: parseFloat(closeCost) || 0,
      newStrike: parseFloat(newStrike) || 0,
      newPremiumPerContract: parseFloat(newPremium) || 0,
      originalPremiumPerShare: originalPrem,
    });
    setRollResult(res);
  }, [currentStrike, currentContracts, closeCost, newStrike, newPremium, initialData]);

  const handleApplyRoll = async () => {
    if (!isPremium) {
      onOpenPaywall();
      return;
    }

    if (!initialData?.id || !onExecuteRoll) {
      Alert.alert('Simulation Only', 'You can simulate roll calculations here. To execute a roll on an active position, tap the Roll icon on the position card in your portfolio.');
      return;
    }

    const parsedNewStrike = parseFloat(newStrike);
    const parsedNewPremium = parseFloat(newPremium);
    const parsedCloseDebit = parseFloat(closeCost);
    const parsedDte = parseInt(newDte, 10);

    if (isNaN(parsedNewStrike) || parsedNewStrike <= 0) {
      Alert.alert('Invalid Strike', 'Please enter a valid positive new strike price.');
      return;
    }
    if (isNaN(parsedNewPremium) || parsedNewPremium <= 0) {
      Alert.alert('Invalid Premium', 'Please enter a valid positive new option premium.');
      return;
    }
    if (isNaN(parsedCloseDebit) || parsedCloseDebit < 0) {
      Alert.alert('Invalid Debit', 'Please enter a valid buyback debit cost.');
      return;
    }
    if (isNaN(parsedDte) || parsedDte <= 0) {
      Alert.alert('Invalid DTE', 'Please enter valid days to expiration (e.g. 30).');
      return;
    }

    const newExpirationDate = new Date(Date.now() + parsedDte * 86400000).toISOString().split('T')[0];

    const res = await onExecuteRoll(initialData.id, {
      newStrike: parsedNewStrike,
      newPremium: parsedNewPremium,
      newExpirationDate,
      newDte: parsedDte,
      closeDebitPerShare: parsedCloseDebit,
    });

    if (res.paywallTriggered) {
      onOpenPaywall();
    } else if (res.success) {
      Alert.alert(
        'Roll Executed!',
        `Your ${initialData.ticker || ''} CSP position was successfully rolled down and out to $${parsedNewStrike.toFixed(2)} Strike.`,
        [
          {
            text: 'View in Portfolio',
            onPress: () => {
              if (onRollSuccess) onRollSuccess();
            },
          },
          {
            text: 'OK',
            onPress: () => {
              if (onRollSuccess) onRollSuccess();
            },
          },
        ]
      );
    } else {
      Alert.alert('Roll Failed', 'Could not execute roll. The original trade may have already been closed.');
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

      {/* Active Position Being Rolled Banner */}
      {initialData?.ticker && (
        <View style={styles.activeTradeBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.activeTradeTicker}>
              Rolling: {initialData.ticker} (${initialData.strikePrice?.toFixed(2)} Put)
            </Text>
            <Text style={styles.activeTradeSub}>
              Initial Premium: +${(initialData.cumulativeCostBasisCredit || initialData.cumulativePremium || initialData.premium || 0).toFixed(2)}/sh • {initialData.contracts} Contract{initialData.contracts > 1 ? 's' : ''}
            </Text>
          </View>
          {onDismissActiveTrade && (
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={onDismissActiveTrade}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <X size={16} color="#A7F3D0" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Standalone Stock Selector Bar */}
      {!initialData?.ticker && (
        <View style={styles.tickerSelectorCard}>
          <Text style={styles.tickerSelectorLabel}>Select Stock to Roll:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tickerPillsRow}>
            {['AAPL', 'NVDA', 'TSLA', 'MSFT', 'SPY'].map((sym) => (
              <TouchableOpacity
                key={sym}
                style={[styles.tickerPill, ticker === sym && styles.tickerPillActive]}
                onPress={() => handleSelectQuickTicker(sym)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tickerPillText, ticker === sym && styles.tickerPillTextActive]}>
                  {sym}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Paywall Lock Ribbon for Free Users */}
      {!isPremium && (
        <TouchableOpacity style={styles.proRibbon} onPress={onOpenPaywall} activeOpacity={0.85}>
          <Crown color="#F59E0B" size={18} style={{ marginRight: 8 }} />
          <Text style={styles.proRibbonText}>Pro Feature: Unlock Full Roll Simulator & Execution</Text>
        </TouchableOpacity>
      )}

      {/* Live Syncing Feedback Spinner Banner */}
      {isSyncingRoll && (
        <View style={styles.syncingRollBanner}>
          <ActivityIndicator size="small" color="#38BDF8" style={{ marginRight: 8 }} />
          <Text style={styles.syncingRollText}>{syncingMessage}</Text>
        </View>
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
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="#64748B"
          />

          <Text style={styles.inputLabel}>Contracts</Text>
          <TextInput
            style={styles.numInput}
            value={currentContracts}
            onChangeText={setCurrentContracts}
            keyboardType="number-pad"
            placeholder="1"
            placeholderTextColor="#64748B"
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={styles.inputLabel}>Buyback Cost ($/sh)</Text>
            {fetchingCloseCost ? (
              <ActivityIndicator size="small" color="#10B981" />
            ) : isCloseCostLive ? (
              <View style={styles.liveBadgeMini}>
                <Text style={styles.liveBadgeMiniText}>LIVE QUOTE</Text>
              </View>
            ) : null}
          </View>
          <TextInput
            style={styles.numInput}
            value={closeCost}
            onChangeText={(val) => {
              setCloseCost(val);
              setIsCloseCostLive(false);
            }}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="#64748B"
          />
          <Text style={styles.inputSubHelper}>
            {isCloseCostLive
              ? 'Auto-calculated from live options ask'
              : 'Market price to buy back & close'}
          </Text>
        </View>

        {/* New Contract */}
        <View style={styles.compareCol}>
          <Text style={styles.colHeaderTitle}>New Put Option</Text>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={styles.inputLabel}>New Strike ($)</Text>
            <TouchableOpacity
              style={styles.dropdownToggleBtn}
              onPress={() => {
                if (optionChain.length === 0) {
                  loadOptionChainData(ticker, parseFloat(currentStrike) || 140, parseInt(newDte, 10) || 30);
                }
                setShowStrikeDropdown(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownToggleText}>Select ▾</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.numInput}
            value={newStrike}
            onChangeText={(val) => {
              setNewStrike(val);
              setIsLiveQuoteActive(false);
            }}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="#64748B"
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={styles.inputLabel}>New DTE (Days)</Text>
            <TouchableOpacity
              style={styles.dropdownToggleBtn}
              onPress={() => {
                if (uniqueExpirations.length === 0) {
                  loadOptionChainData(ticker, parseFloat(currentStrike) || 140, parseInt(newDte, 10) || 30);
                }
                setShowExpDropdown(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownToggleText}>Date ▾</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.numInput}
            value={newDte}
            onChangeText={(val) => {
              setNewDte(val);
              setIsLiveQuoteActive(false);
            }}
            keyboardType="number-pad"
            placeholder="30"
            placeholderTextColor="#64748B"
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={styles.inputLabel}>New Premium ($/sh)</Text>
            {fetchingLiveQuote ? (
              <ActivityIndicator size="small" color="#10B981" />
            ) : isLiveQuoteActive ? (
              <View style={styles.liveBadgeMini}>
                <Text style={styles.liveBadgeMiniText}>LIVE QUOTE</Text>
              </View>
            ) : null}
          </View>
          <TextInput
            style={styles.numInput}
            value={newPremium}
            onChangeText={(val) => {
              setNewPremium(val);
              setIsLiveQuoteActive(false);
            }}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="#64748B"
          />
          <Text style={styles.inputSubHelper}>
            {selectedExpiration ? `Exp: ${selectedExpiration}` : 'New cash collected'}
          </Text>
        </View>
      </View>

      {/* 1-Tap Roll Presets Bar with real-time refresh spinner */}
      <View style={styles.presetsCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={styles.presetsTitle}>Quick Roll Adjustments</Text>
          <Text style={styles.presetsSubTitle}>Auto-refreshes live pricing</Text>
        </View>
        <View style={styles.presetsRow}>
          <TouchableOpacity
            style={[styles.presetBtn, styles.presetBtnStrike]}
            onPress={() => {
              const curr = parseFloat(currentStrike) || 100;
              const dteNum = parseInt(newDte, 10) || 30;
              syncLiveRollQuote(curr, dteNum, 'Syncing Same Strike live quote...');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.presetBtnTextStrike}>Same Strike</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.presetBtn, styles.presetBtnStrike]}
            onPress={() => {
              const curr = parseFloat(currentStrike) || 100;
              const rolledDown = Math.max(1, curr * 0.95);
              const dteNum = parseInt(newDte, 10) || 30;
              syncLiveRollQuote(rolledDown, dteNum, 'Rolling down -5% & fetching quote...');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.presetBtnTextStrike}>-5% Strike</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.presetBtn}
            onPress={() => {
              const baseDte = parseInt(newDte, 10) || 30;
              const updatedDte = baseDte + 7;
              const strikeNum = parseFloat(newStrike) || parseFloat(currentStrike) || 100;
              syncLiveRollQuote(strikeNum, updatedDte, 'Extending expiration +7d...');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.presetBtnText}>+7d</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.presetBtn}
            onPress={() => {
              const baseDte = parseInt(newDte, 10) || 30;
              const updatedDte = baseDte + 14;
              const strikeNum = parseFloat(newStrike) || parseFloat(currentStrike) || 100;
              syncLiveRollQuote(strikeNum, updatedDte, 'Extending expiration +14d...');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.presetBtnText}>+14d</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.presetBtn}
            onPress={() => {
              const baseDte = parseInt(newDte, 10) || 30;
              const updatedDte = baseDte + 30;
              const strikeNum = parseFloat(newStrike) || parseFloat(currentStrike) || 100;
              syncLiveRollQuote(strikeNum, updatedDte, 'Extending expiration +30d...');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.presetBtnText}>+30d</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Simulation Outcome Cards */}
      {rollResult && (
        <View style={styles.outcomeCard}>
          <View style={styles.outcomeHeaderRow}>
            <Text style={styles.outcomeTitle}>Roll Transaction Outcome</Text>
            {isLiveQuoteActive && (
              <View style={styles.liveQuoteTag}>
                <Text style={styles.liveQuoteTagText}>LIVE QUOTE</Text>
              </View>
            )}
          </View>

          {/* Plain-English Concept Explanation */}
          <View style={styles.summaryCallout}>
            <CheckCircle2 size={15} color={rollResult.isNetCredit ? '#10B981' : '#F59E0B'} style={{ marginRight: 8, marginTop: 2 }} />
            <Text style={styles.summaryCalloutText}>
              {rollResult.isNetCredit
                ? `You buy back your current put, sell a new put at $${(parseFloat(newStrike) || 0).toFixed(2)} strike, pocket +$${rollResult.netCreditOrDebit.toFixed(2)} net cash today, and lower your breakeven purchase price to $${rollResult.newEffectiveCostBasis.toFixed(2)}/share.`
                : `You buy back your current put and sell a new put at $${(parseFloat(newStrike) || 0).toFixed(2)} strike with a -$${Math.abs(rollResult.netCreditOrDebit).toFixed(2)} out-of-pocket net debit to reset your expiration.`
              }
            </Text>
          </View>
          
          <View style={styles.outcomeRow}>
            <View>
              <Text style={styles.outcomeLabel}>Cost to Buy Back Existing Put:</Text>
              <Text style={styles.outcomeHelper}>Money paid to cancel current obligation</Text>
            </View>
            <Text style={styles.textDanger}>-${rollResult.closeDebitTotal.toFixed(2)}</Text>
          </View>

          <View style={styles.outcomeRow}>
            <View>
              <Text style={styles.outcomeLabel}>Cash Collected from New Put:</Text>
              <Text style={styles.outcomeHelper}>Fresh premium received from new expiration</Text>
            </View>
            <Text style={styles.textSuccess}>+${rollResult.newCreditTotal.toFixed(2)}</Text>
          </View>

          <View style={[styles.outcomeRow, styles.outcomeHighlightRow]}>
            <View>
              <Text style={styles.outcomeHighlightLabel}>
                {rollResult.isNetCredit ? 'Net Cash Pocketed Today:' : 'Net Out-of-Pocket Debit:'}
              </Text>
              <Text style={styles.outcomeHighlightHelper}>
                {rollResult.isNetCredit ? 'Direct cash profit from this roll' : 'Total cash required to execute roll'}
              </Text>
            </View>
            <Text style={[styles.outcomeHighlightVal, rollResult.isNetCredit ? styles.textSuccess : styles.textDanger]}>
              {rollResult.isNetCredit ? '+' : ''}${rollResult.netCreditOrDebit.toFixed(2)}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.outcomeRow}>
            <View>
              <Text style={styles.outcomeLabel}>New Cash Collateral Required:</Text>
              <Text style={styles.outcomeHelper}>100% secured cash held for new strike</Text>
            </View>
            <Text style={styles.textPrimary}>${rollResult.newCollateralRequired.toLocaleString()}</Text>
          </View>

          <View style={styles.outcomeRow}>
            <View>
              <Text style={styles.outcomeLabel}>Collateral Impact:</Text>
              <Text style={styles.outcomeHelper}>Difference vs current locked funds</Text>
            </View>
            <Text
              style={
                rollResult.collateralDifference < 0
                  ? styles.textSuccess
                  : rollResult.collateralDifference > 0
                  ? styles.textWarning
                  : styles.textSubtle
              }
            >
              {rollResult.collateralDifference < 0
                ? `-$${Math.abs(rollResult.collateralDifference).toLocaleString()} (Freed Up)`
                : rollResult.collateralDifference > 0
                ? `+$${rollResult.collateralDifference.toLocaleString()} (Additional)`
                : '$0 (No Change)'}
            </Text>
          </View>

          <View style={styles.outcomeRow}>
            <View>
              <Text style={styles.outcomeLabel}>New Breakeven Purchase Price:</Text>
              <Text style={styles.outcomeHelper}>Actual cost/share if assigned after all credits</Text>
            </View>
            <Text style={styles.textSuccess}>${rollResult.newEffectiveCostBasis.toFixed(2)}/sh</Text>
          </View>

          {initialData?.id ? (
            <TouchableOpacity style={styles.applyBtn} onPress={handleApplyRoll} activeOpacity={0.85}>
              <LinearGradient colors={['#3B82F6', '#1D4ED8']} style={styles.applyGradient}>
                <Text style={styles.applyBtnText}>Execute Roll Transaction</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={styles.standaloneNotice}>
              <Info size={14} color="#60A5FA" style={{ marginRight: 6 }} />
              <Text style={styles.standaloneNoticeText}>
                Simulation mode. To roll an active portfolio position, tap the 🔄 icon on any trade card in Portfolio.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Strike Selection Modal */}
      <Modal
        visible={showStrikeDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStrikeDropdown(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select New Strike Price</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedExpiration ? `For Expiration: ${selectedExpiration}` : 'Live Options Chain'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowStrikeDropdown(false)}
                activeOpacity={0.7}
              >
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {availableStrikes.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="small" color="#10B981" style={{ marginBottom: 12 }} />
                <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>
                  Loading real-time strikes for {ticker}...
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator>
                {availableStrikes.map((c) => {
                  const isSelected = Math.abs(c.strike - (parseFloat(newStrike) || 0)) < 0.05;
                  const isOtm = c.strike < (initialData?.stockPrice || parseFloat(currentStrike) || 0);
                  return (
                    <TouchableOpacity
                      key={`${c.expiration}-${c.strike}`}
                      style={[styles.modalItemRow, isSelected && styles.modalItemRowSelected]}
                      onPress={() => handleSelectStrike(c)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={[styles.modalStrikeText, isSelected && styles.modalStrikeTextSelected]}>
                            ${c.strike.toFixed(2)} Put
                          </Text>
                          <View style={[styles.moneynessBadge, isOtm ? styles.otmBadge : styles.itmBadge]}>
                            <Text style={[styles.moneynessText, isOtm ? styles.otmText : styles.itmText]}>
                              {isOtm ? 'OTM' : 'ITM'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.modalSubText}>
                          Breakeven: ${(c.strike - c.premium).toFixed(2)} • Return: {((c.premium / (c.strike || 1)) * 100).toFixed(1)}% • Bid/Ask: ${c.bid?.toFixed(2) || '0.00'}/${c.ask?.toFixed(2) || '0.00'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                        <Text style={styles.modalPremText}>+${c.premium.toFixed(2)}</Text>
                        <Text style={styles.modalPremSub}>/share</Text>
                      </View>
                      {isSelected && <Check size={18} color="#10B981" />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Expiration Date Selection Modal */}
      <Modal
        visible={showExpDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExpDropdown(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select New Expiration Date</Text>
                <Text style={styles.modalSubtitle}>Auto-calculates days to expiration</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowExpDropdown(false)}
                activeOpacity={0.7}
              >
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {uniqueExpirations.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="small" color="#10B981" style={{ marginBottom: 12 }} />
                <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>
                  Loading expiration dates for {ticker}...
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator>
                {uniqueExpirations.map((exp) => {
                  const expTime = new Date(`${exp}T16:00:00Z`).getTime();
                  const dteCalc = Math.max(1, Math.round((expTime - Date.now()) / (1000 * 60 * 60 * 24)));
                  const isSelected = exp === selectedExpiration;
                  return (
                    <TouchableOpacity
                      key={exp}
                      style={[styles.modalItemRow, isSelected && styles.modalItemRowSelected]}
                      onPress={() => handleSelectExpiration(exp)}
                      activeOpacity={0.7}
                    >
                      <Calendar size={18} color={isSelected ? '#38BDF8' : '#64748B'} style={{ marginRight: 10 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalStrikeText, isSelected && styles.modalStrikeTextSelected]}>
                          {exp}
                        </Text>
                        <Text style={styles.modalSubText}>{dteCalc} Days to Expiration</Text>
                      </View>
                      {isSelected && <Check size={18} color="#10B981" />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
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
  activeTradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F291E',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  activeTradeTicker: {
    color: '#10B981',
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 2,
  },
  activeTradeSub: {
    color: '#A7F3D0',
    fontSize: 11,
    fontWeight: '600',
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
  },
  outcomeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  liveQuoteTag: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  liveQuoteTagText: {
    color: '#10B981',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  liveBadgeMini: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  liveBadgeMiniText: {
    color: '#10B981',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  summaryCallout: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  summaryCalloutText: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '500',
  },
  outcomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  outcomeLabel: {
    fontSize: 12.5,
    color: '#E2E8F0',
    fontWeight: '600',
  },
  outcomeHelper: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  outcomeHighlightRow: {
    backgroundColor: '#0B0F19',
    padding: 10,
    borderRadius: 10,
    marginVertical: 6,
  },
  outcomeHighlightLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  outcomeHighlightHelper: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
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
  presetsCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  presetsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 8,
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  presetBtn: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#1E3A8A',
  },
  presetBtnText: {
    color: '#3B82F6',
    fontSize: 11.5,
    fontWeight: '700',
  },
  presetBtnStrike: {
    borderColor: '#065F46',
  },
  presetBtnTextStrike: {
    color: '#10B981',
    fontSize: 11.5,
    fontWeight: '700',
  },
  textWarning: {
    color: '#F59E0B',
    fontWeight: '700',
  },
  textSubtle: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  dismissBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  standaloneNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#1E3A8A',
  },
  standaloneNoticeText: {
    flex: 1,
    fontSize: 11.5,
    color: '#93C5FD',
    lineHeight: 16,
  },
  syncingRollBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C4A6E',
    borderWidth: 1,
    borderColor: '#0284C7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  syncingRollText: {
    color: '#BAE6FD',
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownToggleBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  dropdownToggleText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  inputSubHelper: {
    fontSize: 10,
    color: '#64748B',
    marginTop: -4,
    marginBottom: 8,
  },
  presetsSubTitle: {
    fontSize: 10.5,
    color: '#10B981',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#161E2E',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#0F172A',
  },
  modalItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#0B0F19',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  modalItemRowSelected: {
    backgroundColor: '#064E3B',
    borderColor: '#10B981',
  },
  modalStrikeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  modalStrikeTextSelected: {
    color: '#34D399',
  },
  modalSubText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  modalPremText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#10B981',
  },
  modalPremSub: {
    fontSize: 9.5,
    color: '#64748B',
  },
  moneynessBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginLeft: 8,
  },
  otmBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  itmBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  moneynessText: {
    fontSize: 9,
    fontWeight: '800',
  },
  otmText: {
    color: '#10B981',
  },
  itmText: {
    color: '#EF4444',
  },
  tickerSelectorCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  tickerSelectorLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 8,
  },
  tickerPillsRow: {
    flexDirection: 'row',
  },
  tickerPill: {
    backgroundColor: '#0B0F19',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tickerPillActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#3B82F6',
  },
  tickerPillText: {
    color: '#94A3B8',
    fontSize: 12.5,
    fontWeight: '700',
  },
  tickerPillTextActive: {
    color: '#60A5FA',
    fontWeight: '800',
  },
});