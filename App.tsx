import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Search, Briefcase, RefreshCw, Settings as SettingsIcon, Crown, Sparkles, RotateCcw, BookOpen } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { useAppStorage } from './src/hooks/useAppStorage';
import { calculateDaysRemaining } from './src/services/exportService';
import Calculator from './src/screens/Calculator';
import ActiveTrades from './src/screens/ActiveTrades';
import RollSimulator from './src/screens/RollSimulator';
import WheelHub from './src/screens/WheelHub';
import GuideCenter from './src/screens/GuideCenter';
import Settings from './src/screens/Settings';
import Subscription from './src/screens/Subscription';
import Onboarding from './src/screens/Onboarding';
import { FREE_TIER_COPY } from './src/services/freeTierQuota';

// Silence foreground notifications while using app
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const [currentTab, setCurrentTab] = useState<'analyzer' | 'wheel' | 'portfolio' | 'guides' | 'roll' | 'settings'>('analyzer');
  const wheelTransitionLock = useRef(false);
  const [showPaywall, setShowPaywall] = useState<boolean>(false);
  const [showReplayTour, setShowReplayTour] = useState<boolean>(false);
  const [activeRollData, setActiveRollData] = useState<any>(null);

  const {
    trades,
    history,
    isPremium,
    isTrialActive,
    trialDaysRemaining,
    hasProAccess,
    loading,
    tradeUsed,
    wheelUsed,
    quotaReady,
    claimWheelSlot,
    noteExisting,
    hasCompletedOnboarding,
    completeOnboarding,
    retentionDays,
    expirationAlertThreshold,

    addTrade,
    updateTradeStatus,
    removeTrade,
    executeRoll,
    refreshPremiumStatus,
    updateRetentionDays,
    updateExpirationAlertThreshold,
    clearAllData,
  } = useAppStorage();

  // Schedule native background notifications for expiring CSP trades
  useEffect(() => {
    if (loading) return;

    let isCancelled = false;

    async function scheduleExpirationAlerts() {
      try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        if (isCancelled) return;
        for (const notif of scheduled) {
          if (notif.identifier.startsWith('csp_expiry_')) {
            await Notifications.cancelScheduledNotificationAsync(notif.identifier);
          }
        }

        if (expirationAlertThreshold === 0 || trades.length === 0 || !hasProAccess || isCancelled) return;

        const { status } = await Notifications.getPermissionsAsync();
        let finalStatus = status;
        if (status !== 'granted') {
          const { status: askStatus } = await Notifications.requestPermissionsAsync();
          finalStatus = askStatus;
        }
        if (finalStatus !== 'granted' || isCancelled) return;

        const NOTIFIED_KEY = '@csp_notified_dates';
        const todayStr = new Date().toISOString().split('T')[0];
        const notifiedRaw = await AsyncStorage.getItem(NOTIFIED_KEY);
        if (isCancelled) return;
        const notifiedMap: Record<string, string> = notifiedRaw ? JSON.parse(notifiedRaw) : {};

        let mapChanged = false;
        for (const trade of trades) {
          if (isCancelled) return;
          const dteLeft = calculateDaysRemaining(trade.expirationDate, trade.dte);
          if (dteLeft <= expirationAlertThreshold && trade.status === 'active') {
            // Deduplicate: notify at most once per calendar day per position
            if (notifiedMap[trade.id] !== todayStr) {
              await Notifications.scheduleNotificationAsync({
                identifier: `csp_expiry_${trade.id}`,
                content: {
                  title: `CSP Expiration Alert: ${trade.ticker}`,
                  body: `Your $${trade.strikePrice} ${trade.ticker} Put option expires in ${dteLeft} day${dteLeft === 1 ? '' : 's'}! Check position status.`,
                },
                trigger: null,
              });
              notifiedMap[trade.id] = todayStr;
              mapChanged = true;
            }
          }
        }

        if (mapChanged && !isCancelled) {
          await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify(notifiedMap));
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('[Notifications] Alert scheduling failed:', err);
        }
      }
    }

    scheduleExpirationAlerts();

    return () => {
      isCancelled = true;
    };
  }, [loading, trades, expirationAlertThreshold, hasProAccess]);

  useEffect(() => {
    if (loading || hasProAccess) {
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem('@csp_wheel_positions_v1')
      .then((json) => {
        if (cancelled || !json) {
          return;
        }
        const parsed = JSON.parse(json);
        const savedWheels = Array.isArray(parsed) ? parsed.filter((item) => item?.id !== 'sample_1') : [];
        if (savedWheels.length > 0) {
          noteExisting('wheel', savedWheels.length).catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loading, hasProAccess, noteExisting]);

  const handleOpenRollWithData = (tradeData: any) => {
    setActiveRollData(tradeData);
    setCurrentTab('roll');
  };

  const handleTransitionTradeToWheel = async (tradeData: { ticker: string; strike: number; premium: number; shares: number }) => {
    if (wheelTransitionLock.current) {
      return;
    }
    wheelTransitionLock.current = true;
    let reservedFreeWheel = false;
    try {
      const STORAGE_KEY_WHEEL = '@csp_wheel_positions_v1';
      const existing = await AsyncStorage.getItem(STORAGE_KEY_WHEEL);
      const parsed = existing ? JSON.parse(existing) : [];
      const list = Array.isArray(parsed) ? parsed.filter((item) => item?.id !== 'sample_1') : [];

      if (!hasProAccess) {
        if (list.length > 0) {
          noteExisting('wheel', list.length).catch(() => undefined);
          setShowPaywall(true);
          Alert.alert(FREE_TIER_COPY.wheelTitle, FREE_TIER_COPY.wheelBody, [
            { text: 'Unlock Pro', onPress: () => setShowPaywall(true) },
            { text: 'Cancel', style: 'cancel' },
          ]);
          return;
        }
        const claim = await claimWheelSlot();
        if (!claim.ok) {
          if (claim.paywall) {
            setShowPaywall(true);
            Alert.alert(FREE_TIER_COPY.wheelTitle, FREE_TIER_COPY.wheelBody, [
              { text: 'Unlock Pro', onPress: () => setShowPaywall(true) },
              { text: 'Cancel', style: 'cancel' },
            ]);
          } else if (claim.message) {
            Alert.alert('Save needs a connection', claim.message);
          }
          return;
        }
        reservedFreeWheel = true;
      }

      const newWheelPos = {
        id: Date.now().toString(),
        ticker: tradeData.ticker,
        phase: 'assigned_shares' as const,
        initialStrike: tradeData.strike,
        initialPutPremium: tradeData.premium,
        shares: tradeData.shares,
        assignedDate: new Date().toISOString().split('T')[0],
        assignedPrice: tradeData.strike,
        coveredCallsSold: [],
        notes: `Imported from assigned ${tradeData.ticker} CSP trade`,
      };
      
      const updated = [newWheelPos, ...list];
      await AsyncStorage.setItem(STORAGE_KEY_WHEEL, JSON.stringify(updated));
      setCurrentTab('wheel');
    } catch (e) {
      console.warn('Failed to transition trade to wheel', e);
      if (reservedFreeWheel) {
        Alert.alert('Could not save this wheel', 'Your free wheel stays reserved on this device.');
      }
      setCurrentTab('wheel');
    } finally {
      wheelTransitionLock.current = false;
    }
  };

  const handleBadgePress = () => {
    if (isPremium) {
      Alert.alert(
        'Pro Access Active 👑',
        'You have full access to CashSecuredProfit Pro. Unlimited portfolio tracking, automated expiration alerts, live option chains, Roll Simulator, and the Wheel Suite are active on your device.',
        [
          {
            text: 'Manage in Apple ID',
            onPress: () => {
              Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => {
                Alert.alert('Error', 'Unable to open Apple ID subscription settings.');
              });
            },
          },
          { text: 'Done', style: 'cancel' },
        ]
      );
    } else {
      setShowPaywall(true);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Top App Header with Trial Status */}
      <View style={styles.topHeader}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>CashSecured Put & Wheel</Text>

          <TouchableOpacity onPress={handleBadgePress} activeOpacity={0.8}>
            {isPremium ? (
              <View style={[styles.tierBadge, styles.badgePro]}>
                <Crown color="#FFF" size={12} style={{ marginRight: 4 }} />
                <Text style={styles.tierBadgeText}>PRO</Text>
              </View>
            ) : isTrialActive ? (
              <View style={[styles.tierBadge, styles.badgeTrial]}>
                <Sparkles color="#FFF" size={12} style={{ marginRight: 4 }} />
                <Text style={styles.tierBadgeText}>TRIAL: {trialDaysRemaining} DAYS FREE</Text>
              </View>
            ) : (
              <View style={[styles.tierBadge, styles.badgeFree]}>
                <Crown color="#94A3B8" size={12} style={{ marginRight: 4 }} />
                <Text style={styles.tierBadgeText}>UPGRADE TO PRO</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Tab Screen Content */}
      <View style={styles.contentContainer}>
        {currentTab === 'analyzer' && (
          <Calculator
            onSaveTrade={addTrade}
            onOpenRollSim={handleOpenRollWithData}
            onOpenPaywall={() => setShowPaywall(true)}
            isPremium={hasProAccess}
            showFreeTierNote={!loading && !hasProAccess}
            savedTradesCount={trades.length}
          />
        )}

        {currentTab === 'wheel' && (
          <WheelHub
            onOpenPaywall={() => setShowPaywall(true)}
            isPremium={hasProAccess}
            wheelUsed={quotaReady && !loading && !hasProAccess && wheelUsed}
            claimWheelSlot={claimWheelSlot}
            existingSyncReady={!loading}
            onExistingWheel={(count) => {
              if (!hasProAccess && count > 0) {
                noteExisting('wheel', count).catch(() => undefined);
              }
            }}
          />
        )}

        {currentTab === 'portfolio' && (
          <ActiveTrades
            trades={trades}
            history={history}
            onUpdateStatus={updateTradeStatus}
            onRemoveTrade={removeTrade}
            onRollTrade={handleOpenRollWithData}
            onOpenRollSim={() => handleOpenRollWithData(null)}
            onTransitionToWheel={handleTransitionTradeToWheel}
            onOpenPaywall={() => setShowPaywall(true)}
            isPremium={hasProAccess}
            tradeSlotUsed={quotaReady && !loading && !hasProAccess && tradeUsed}
          />
        )}

        {currentTab === 'guides' && (
          <GuideCenter />
        )}

        {currentTab === 'roll' && (
          <RollSimulator
            initialData={activeRollData}
            onExecuteRoll={executeRoll}
            onOpenPaywall={() => setShowPaywall(true)}
            isPremium={hasProAccess}
            onDismissActiveTrade={() => setActiveRollData(null)}
            onBack={() => {
              setActiveRollData(null);
              setCurrentTab('portfolio');
            }}
            onRollSuccess={() => {
              setActiveRollData(null);
              setCurrentTab('portfolio');
            }}
          />
        )}

        {currentTab === 'settings' && (
          <Settings
            isPremium={isPremium}
            retentionDays={retentionDays}
            expirationAlertThreshold={expirationAlertThreshold}
            trades={trades}
            history={history}
            updateRetentionDays={updateRetentionDays}
            updateExpirationAlertThreshold={updateExpirationAlertThreshold}
            onClearData={clearAllData}
            onOpenPaywall={() => setShowPaywall(true)}
            onReplayTour={() => setShowReplayTour(true)}
            showFreeTierNote={!loading && !hasProAccess}
          />
        )}
      </View>

      {/* 5-Tab Apple HIG Bottom Navigation Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setCurrentTab('analyzer')}
        >
          <Search color={currentTab === 'analyzer' ? '#10B981' : '#64748B'} size={20} />
          <Text style={[styles.tabLabel, currentTab === 'analyzer' && styles.tabLabelActive]}>Analyzer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setCurrentTab('portfolio')}
        >
          <View>
            <Briefcase color={currentTab === 'portfolio' ? '#10B981' : '#64748B'} size={20} />
            {trades.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{trades.length}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.tabLabel, currentTab === 'portfolio' && styles.tabLabelActive]}>Portfolio</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setCurrentTab('wheel')}
        >
          <RotateCcw color={currentTab === 'wheel' ? '#10B981' : '#64748B'} size={20} />
          <Text style={[styles.tabLabel, currentTab === 'wheel' && styles.tabLabelActive]}>Wheel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setCurrentTab('guides')}
        >
          <BookOpen color={currentTab === 'guides' ? '#10B981' : '#64748B'} size={20} />
          <Text style={[styles.tabLabel, currentTab === 'guides' && styles.tabLabelActive]}>Learn</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setCurrentTab('settings')}
        >
          <SettingsIcon color={currentTab === 'settings' ? '#10B981' : '#64748B'} size={20} />
          <Text style={[styles.tabLabel, currentTab === 'settings' && styles.tabLabelActive]}>Settings</Text>
        </TouchableOpacity>
      </View>


      {/* Onboarding Strategy Briefing Modal (First Launch & Replay Tour) */}
      <Modal
        visible={(!loading && !hasCompletedOnboarding) || showReplayTour}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <Onboarding
          visible={(!loading && !hasCompletedOnboarding) || showReplayTour}
          isReplay={showReplayTour}
          onComplete={() => {
            if (!hasCompletedOnboarding) {
              completeOnboarding();
            }
            setShowReplayTour(false);
          }}
          onOpenPaywall={() => {
            if (!hasCompletedOnboarding) {
              completeOnboarding();
            }
            setShowReplayTour(false);
            setShowPaywall(true);
          }}
        />
      </Modal>

      {/* RevenueCat Paywall Modal */}
      <Modal visible={showPaywall} animationType="slide" presentationStyle="pageSheet">
        <Subscription
          onClose={() => setShowPaywall(false)}
          onSuccess={() => {
            refreshPremiumStatus();
            setShowPaywall(false);
          }}
        />
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  topHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#161E2E',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.4,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  badgePro: {
    backgroundColor: '#F59E0B',
  },
  badgeTrial: {
    backgroundColor: '#059669',
  },
  badgeFree: {
    backgroundColor: '#334155',
  },
  tierBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  contentContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#161E2E',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#10B981',
    fontWeight: '800',
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#10B981',
    borderRadius: 9,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
});