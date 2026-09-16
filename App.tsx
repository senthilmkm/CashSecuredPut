import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Search, Briefcase, RefreshCw, Settings as SettingsIcon, Crown, Sparkles } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { useAppStorage } from './src/hooks/useAppStorage';
import Calculator from './src/screens/Calculator';
import ActiveTrades from './src/screens/ActiveTrades';
import RollSimulator from './src/screens/RollSimulator';
import Settings from './src/screens/Settings';
import Subscription from './src/screens/Subscription';

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
  const [currentTab, setCurrentTab] = useState<'analyzer' | 'portfolio' | 'roll' | 'settings'>('analyzer');
  const [showPaywall, setShowPaywall] = useState<boolean>(false);
  const [activeRollData, setActiveRollData] = useState<any>(null);

  const {
    trades,
    history,
    isPremium,
    isTrialActive,
    trialDaysRemaining,
    hasProAccess,
    loading,
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

    async function scheduleExpirationAlerts() {
      try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        for (const notif of scheduled) {
          if (notif.identifier.startsWith('csp_expiry_')) {
            await Notifications.cancelScheduledNotificationAsync(notif.identifier);
          }
        }

        if (expirationAlertThreshold === 0 || trades.length === 0) return;

        const { status } = await Notifications.getPermissionsAsync();
        let finalStatus = status;
        if (status !== 'granted') {
          const { status: askStatus } = await Notifications.requestPermissionsAsync();
          finalStatus = askStatus;
        }
        if (finalStatus !== 'granted') return;

        for (const trade of trades) {
          if (trade.dte <= expirationAlertThreshold && trade.status === 'active') {
            await Notifications.scheduleNotificationAsync({
              identifier: `csp_expiry_${trade.id}`,
              content: {
                title: `CSP Expiration Alert: ${trade.ticker}`,
                body: `Your $${trade.strikePrice} ${trade.ticker} Put option expires in ${trade.dte} days! Check position status.`,
              },
              trigger: null,
            });
          }
        }
      } catch (err) {
        console.warn('[Notifications] Alert scheduling failed:', err);
      }
    }

    scheduleExpirationAlerts();
  }, [loading, trades, expirationAlertThreshold]);

  const handleOpenRollWithData = (tradeData: any) => {
    setActiveRollData(tradeData);
    setCurrentTab('roll');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Top App Header with Trial Status */}
      <View style={styles.topHeader}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>CashSecuredProfit</Text>

          <TouchableOpacity onPress={() => !isPremium && setShowPaywall(true)} activeOpacity={0.8}>
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
            savedTradesCount={trades.length}
          />
        )}

        {currentTab === 'portfolio' && (
          <ActiveTrades
            trades={trades}
            onUpdateStatus={updateTradeStatus}
            onRemoveTrade={removeTrade}
            onRollTrade={handleOpenRollWithData}
            onOpenPaywall={() => setShowPaywall(true)}
            isPremium={hasProAccess}
          />
        )}

        {currentTab === 'roll' && (
          <RollSimulator
            initialData={activeRollData}
            onExecuteRoll={executeRoll}
            onOpenPaywall={() => setShowPaywall(true)}
            isPremium={hasProAccess}
          />
        )}

        {currentTab === 'settings' && (
          <Settings
            isPremium={isPremium}
            retentionDays={retentionDays}
            expirationAlertThreshold={expirationAlertThreshold}
            trades={trades}
            history={history}
            onUpdateRetention={updateRetentionDays}
            onUpdateAlertThreshold={updateExpirationAlertThreshold}
            onClearData={clearAllData}
            onOpenPaywall={() => setShowPaywall(true)}
          />
        )}
      </View>

      {/* Bottom Navigation Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setCurrentTab('analyzer')}
        >
          <Search color={currentTab === 'analyzer' ? '#10B981' : '#64748B'} size={22} />
          <Text style={[styles.tabLabel, currentTab === 'analyzer' && styles.tabLabelActive]}>Analyzer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setCurrentTab('portfolio')}
        >
          <View>
            <Briefcase color={currentTab === 'portfolio' ? '#10B981' : '#64748B'} size={22} />
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
          onPress={() => setCurrentTab('roll')}
        >
          <RefreshCw color={currentTab === 'roll' ? '#10B981' : '#64748B'} size={22} />
          <Text style={[styles.tabLabel, currentTab === 'roll' && styles.tabLabelActive]}>Roll Sim</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setCurrentTab('settings')}
        >
          <SettingsIcon color={currentTab === 'settings' ? '#10B981' : '#64748B'} size={22} />
          <Text style={[styles.tabLabel, currentTab === 'settings' && styles.tabLabelActive]}>Settings</Text>
        </TouchableOpacity>
      </View>

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
    paddingHorizontal: 20,
    paddingVertical: 14,
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
    fontSize: 20,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
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