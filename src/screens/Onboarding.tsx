import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import {
  TrendingUp,
  RotateCcw,
  Bell,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Percent,
  Layers,
  Crown,
} from 'lucide-react-native';
import { restorePremiumPurchases } from '../services/purchases';


interface OnboardingProps {
  visible: boolean;
  onComplete: () => void;
  onOpenPaywall: () => void;
  isReplay?: boolean;
}

export default function Onboarding({
  visible,
  onComplete,
  onOpenPaywall,
  isReplay = false,
}: OnboardingProps) {
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  if (!visible) return null;

  const handleNext = () => {
    if (currentSlide < 2) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const handleRestore = async () => {
    try {
      setIsRestoring(true);
      const isRestored = await restorePremiumPurchases();
      if (isRestored) {

        Alert.alert('Purchases Restored', 'Your Pro subscription has been successfully restored!', [
          { text: 'OK', onPress: onComplete },
        ]);
      } else {
        Alert.alert('No Active Subscription', 'We could not find an active subscription for your Apple ID.');
      }
    } catch (e) {
      Alert.alert('Restore Failed', 'Unable to reach the App Store. Please try again later.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Top Header: Brand Indicator & Subtle Skip Button */}
        <View style={styles.headerRow}>
          <View style={styles.brandBadge}>
            <TrendingUp color="#10B981" size={16} />
            <Text style={styles.brandText}>CashSecuredPut</Text>
          </View>

          <TouchableOpacity
            onPress={onComplete}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
            style={styles.skipButton}
          >
            <Text style={styles.skipText}>{isReplay ? 'Close' : 'Skip'}</Text>
          </TouchableOpacity>
        </View>

        {/* Scrollable Content Container (Guarantees zero UI clipping on iPhone SE) */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* SLIDE 0: Mathematical Edge & Yield Efficiency */}
          {currentSlide === 0 && (
            <View style={styles.slideContainer}>
              <View style={styles.badgeRow}>
                <View style={[styles.pillBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Percent color="#10B981" size={13} style={{ marginRight: 5 }} />
                  <Text style={[styles.pillText, { color: '#10B981' }]}>MATHEMATICAL PRECISION</Text>
                </View>
              </View>

              <Text style={styles.title}>Know Your True Yield Before You Sell</Text>
              <Text style={styles.subtitle}>
                Stop guessing options premiums. Calculate annualized ROC, risk-free Treasury spreads, and downside breakevens in seconds.
              </Text>

              {/* Graphic Card */}
              <View style={styles.metricCard}>
                <View style={styles.metricCardHeader}>
                  <View>
                    <Text style={styles.metricTicker}>AAPL $170 PUT</Text>
                    <Text style={styles.metricSub}>30 DTE • 1 Contract</Text>
                  </View>
                  <View style={styles.scorePill}>
                    <Text style={styles.scorePillText}>SCORE 92/100</Text>
                  </View>
                </View>

                <View style={styles.metricDivider} />

                <View style={styles.metricGrid}>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>Net Cash Upfront</Text>
                    <Text style={[styles.metricValue, { color: '#10B981' }]}>+$320.00</Text>
                  </View>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>Annualized APR</Text>
                    <Text style={[styles.metricValue, { color: '#38BDF8' }]}>23.4%</Text>
                  </View>
                </View>

                <View style={styles.benchmarkBox}>
                  <CheckCircle2 color="#10B981" size={14} style={{ marginRight: 6 }} />
                  <Text style={styles.benchmarkText}>
                    +18.6% above 3-Month US Treasury Risk-Free Yield
                  </Text>
                </View>

                <View style={styles.cushionRow}>
                  <ShieldCheck color="#F59E0B" size={14} style={{ marginRight: 6 }} />
                  <Text style={styles.cushionText}>Effective Cost Basis: $166.80 (7.3% safety buffer)</Text>
                </View>
              </View>
            </View>
          )}

          {/* SLIDE 1: The Complete Wheel Strategy Suite */}
          {currentSlide === 1 && (
            <View style={styles.slideContainer}>
              <View style={styles.badgeRow}>
                <View style={[styles.pillBadge, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                  <RotateCcw color="#818CF8" size={13} style={{ marginRight: 5 }} />
                  <Text style={[styles.pillText, { color: '#818CF8' }]}>THE WHEEL STRATEGY</Text>
                </View>
              </View>

              <Text style={styles.title}>Turn Assignment into Discounted Ownership</Text>
              <Text style={styles.subtitle}>
                If your Put gets assigned, don’t panic. The Wheel transitions assigned shares into Covered Calls, continuously reducing your cost basis.
              </Text>

              {/* Wheel Flow Graphic Card */}
              <View style={styles.wheelCard}>
                <View style={styles.wheelStep}>
                  <View style={[styles.wheelStepIcon, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                    <Text style={[styles.wheelStepNum, { color: '#10B981' }]}>1</Text>
                  </View>
                  <View style={styles.wheelStepInfo}>
                    <Text style={styles.wheelStepTitle}>Sell Cash-Secured Puts</Text>
                    <Text style={styles.wheelStepDesc}>Collect high cash premium while waiting to buy at a discount.</Text>
                  </View>
                </View>

                <View style={styles.wheelConnector} />

                <View style={styles.wheelStep}>
                  <View style={[styles.wheelStepIcon, { backgroundColor: 'rgba(245, 158, 11, 0.2)' }]}>
                    <Text style={[styles.wheelStepNum, { color: '#F59E0B' }]}>2</Text>
                  </View>
                  <View style={styles.wheelStepInfo}>
                    <Text style={styles.wheelStepTitle}>Stock Assigned at Discount</Text>
                    <Text style={styles.wheelStepDesc}>Previous Put premiums lower your net purchase cost.</Text>
                  </View>
                </View>

                <View style={styles.wheelConnector} />

                <View style={styles.wheelStep}>
                  <View style={[styles.wheelStepIcon, { backgroundColor: 'rgba(99, 102, 241, 0.2)' }]}>
                    <Text style={[styles.wheelStepNum, { color: '#818CF8' }]}>3</Text>
                  </View>
                  <View style={styles.wheelStepInfo}>
                    <Text style={styles.wheelStepTitle}>Sell Covered Calls</Text>
                    <Text style={styles.wheelStepDesc}>Generate compounding income until shares are called away for profit.</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* SLIDE 2: Capital Protection & Alerts */}
          {currentSlide === 2 && (
            <View style={styles.slideContainer}>
              <View style={styles.badgeRow}>
                <View style={[styles.pillBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                  <ShieldCheck color="#F59E0B" size={13} style={{ marginRight: 5 }} />
                  <Text style={[styles.pillText, { color: '#F59E0B' }]}>CAPITAL DEFENSE</Text>
                </View>
              </View>

              <Text style={styles.title}>Never Miss an Expiration or Assignment</Text>
              <Text style={styles.subtitle}>
                Get automated expiration alerts before expiration day. If a trade tests your strike, use the Roll Simulator to defend your capital for a net credit.
              </Text>

              {/* Push Alert Preview Card */}
              <View style={styles.alertCard}>
                <View style={styles.alertHeader}>
                  <View style={styles.alertIconCircle}>
                    <Bell color="#F59E0B" size={16} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.alertApp}>CSP ALERT</Text>
                    <Text style={styles.alertTitle}>MSFT $400 Put Expiring Soon</Text>
                  </View>
                  <Text style={styles.alertTime}>3d Left</Text>
                </View>
                <Text style={styles.alertBody}>
                  Contract is within your notification threshold. Simulate rolling to next month to collect additional credit and buy time.
                </Text>

                <View style={styles.rollSimPill}>
                  <Layers color="#10B981" size={13} style={{ marginRight: 6 }} />
                  <Text style={styles.rollSimText}>1-Tap Roll Simulator: +$140 Net Credit</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Bottom Navigation & Action Controls */}
        <View style={styles.footer}>
          {/* Dot Indicators */}
          <View style={styles.dotsRow}>
            {[0, 1, 2].map((idx) => (
              <View
                key={idx}
                style={[
                  styles.dot,
                  currentSlide === idx ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>

          {/* Action Buttons */}
          {currentSlide < 2 ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleNext}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
              <ArrowRight color="#0B0F19" size={18} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          ) : (
            <View style={styles.finalActions}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {
                  onComplete();
                  onOpenPaywall();
                }}
                activeOpacity={0.85}
              >
                <Crown color="#0B0F19" size={18} style={{ marginRight: 6 }} />
                <Text style={styles.primaryButtonText}>Start 7-Day Free Trial</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onComplete}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryButtonText}>Continue with Free Tier</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.restoreButton}
                onPress={handleRestore}
                disabled={isRestoring}
                activeOpacity={0.7}
              >
                <Text style={styles.restoreText}>
                  {isRestoring ? 'Checking App Store...' : 'Restore Purchases'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
    justifyContent: 'space-between',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161E2E',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  brandText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
    letterSpacing: 0.3,
  },
  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  skipText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  slideContainer: {
    alignItems: 'center',
  },
  badgeRow: {
    marginBottom: 12,
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  metricCard: {
    width: '100%',
    backgroundColor: '#161E2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  metricCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricTicker: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  metricSub: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  scorePill: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  scorePillText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  metricDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 12,
  },
  metricGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  benchmarkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    marginBottom: 8,
  },
  benchmarkText: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '500',
  },
  cushionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  cushionText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '500',
  },
  wheelCard: {
    width: '100%',
    backgroundColor: '#161E2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  wheelStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wheelStepIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  wheelStepNum: {
    fontSize: 14,
    fontWeight: '800',
  },
  wheelStepInfo: {
    flex: 1,
  },
  wheelStepTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  wheelStepDesc: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
  },
  wheelConnector: {
    width: 2,
    height: 16,
    backgroundColor: '#1E293B',
    marginLeft: 15,
    marginVertical: 4,
  },
  alertCard: {
    width: '100%',
    backgroundColor: '#161E2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  alertIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertApp: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  alertTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  alertTime: {
    color: '#64748B',
    fontSize: 11,
  },
  alertBody: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  rollSimPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  rollSimText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 22,
    paddingBottom: Platform.OS === 'ios' ? 14 : 20,
    paddingTop: 10,
    backgroundColor: '#0B0F19',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    marginHorizontal: 4,
  },
  dotActive: {
    width: 22,
    backgroundColor: '#10B981',
  },
  dotInactive: {
    width: 6,
    backgroundColor: '#334155',
  },
  primaryButton: {
    backgroundColor: '#10B981',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#0B0F19',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  finalActions: {
    width: '100%',
    alignItems: 'center',
  },
  secondaryButton: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryButtonText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  restoreButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  restoreText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
  },
});
