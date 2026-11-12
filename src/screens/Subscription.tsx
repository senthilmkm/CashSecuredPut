import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Crown, X, Shield, RefreshCw, Zap, TrendingUp, Sparkles, FileText } from 'lucide-react-native';
import { FREE_TIER_COPY } from '../services/freeTierQuota';
import {
  purchasePremiumPlan,
  restorePremiumPurchases,
  getSubscriptionPlans,
  AvailablePlans,
  PRODUCT_IDS,
} from '../services/purchases';

interface SubscriptionProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function Subscription({ onClose, onSuccess }: SubscriptionProps) {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<AvailablePlans>({
    annual: { identifier: PRODUCT_IDS.ANNUAL, priceString: '$39.99' },
    monthly: { identifier: PRODUCT_IDS.MONTHLY, priceString: '$4.99' },
  });

  useEffect(() => {
    let isMounted = true;
    async function loadPlans() {
      try {
        const available = await getSubscriptionPlans();
        if (isMounted && (available.annual || available.monthly)) {
          setPlans(prev => ({
            annual: available.annual || prev.annual,
            monthly: available.monthly || prev.monthly,
          }));
        }
      } catch (err) {
        console.warn('[Subscription] Failed to load subscription plans:', err);
      }
    }
    loadPlans();
    return () => {
      isMounted = false;
    };
  }, []);

  const handlePurchase = async () => {
    setLoading(true);
    try {
      const planId = selectedPlan === 'annual' ? PRODUCT_IDS.ANNUAL : PRODUCT_IDS.MONTHLY;
      const success = await purchasePremiumPlan(planId);
      if (success) {
        Alert.alert(
          'Pro Access Activated!',
          'Welcome to CashSecuredProfit Pro. You now have full access to unlimited portfolio trades, Wheel Suite, and advanced tools.',
          [
            {
              text: 'Get Started',
              onPress: () => {
                onSuccess();
                onClose();
              },
            },
          ]
        );
      }
    } catch (error: any) {
      if (error?.message === 'USER_CANCELLED' || error?.userCancelled) {
        // User voluntarily dismissed Apple purchase dialog
        return;
      }
      Alert.alert(
        'Unable to Complete Purchase',
        error?.message || 'Could not complete the purchase with the App Store. Please verify your Apple ID and internet connection, then try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      const restored = await restorePremiumPurchases();
      if (restored) {
        Alert.alert('Purchases Restored', 'Your Pro subscription has been restored.', [
          {
            text: 'OK',
            onPress: () => {
              onSuccess();
              onClose();
            },
          },
        ]);
      } else {
        Alert.alert('No Subscription Found', 'No active Pro subscription was found for your Apple ID.');
      }
    } catch (error: any) {
      Alert.alert('Restore Error', error?.message || 'Failed to restore purchases.');
    } finally {
      setLoading(false);
    }
  };

  const annualPriceStr = plans.annual?.priceString || '$39.99';
  const monthlyPriceStr = plans.monthly?.priceString || '$4.99';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header Close */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X color="#94A3B8" size={24} />
        </TouchableOpacity>

        {/* Hero Crown Badge */}
        <View style={styles.heroSection}>
          <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.crownCircle}>
            <Crown color="#FFF" size={36} />
          </LinearGradient>

          <View style={styles.trialBadgeContainer}>
            <Sparkles color="#F59E0B" size={14} style={{ marginRight: 6 }} />
            <Text style={styles.trialBadgeText}>7-DAY FREE TRIAL INCLUDED</Text>
          </View>

          <Text style={styles.heroTitle}>Unlock CashSecuredProfit Pro</Text>
          <Text style={styles.heroSubtitle}>
            Try 7 days free. Maximize your options yield and master The Wheel strategy. Cancel anytime.
          </Text>
          <Text style={styles.freeTierLine}>{FREE_TIER_COPY.summary}</Text>
        </View>

        {/* Feature Highlights */}
        <View style={styles.featuresContainer}>
          <View style={styles.featureRow}>
            <View style={styles.featureIconBox}>
              <Zap color="#10B981" size={20} />
            </View>
            <View style={styles.featureTextCol}>
              <Text style={styles.featureTitle}>Unlimited Portfolio Tracking</Text>
              <Text style={styles.featureDesc}>Store and manage unlimited CSP positions. Free tier includes 1 saved trade on this device. Deleting it does not unlock another.</Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={styles.featureIconBox}>
              <RefreshCw color="#3B82F6" size={20} />
            </View>
            <View style={styles.featureTextCol}>
              <Text style={styles.featureTitle}>Roll Down & Out Simulator</Text>
              <Text style={styles.featureDesc}>1-tap roll execution with live strikes, credit calculations & portfolio sync.</Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={styles.featureIconBox}>
              <TrendingUp color="#F59E0B" size={20} />
            </View>
            <View style={styles.featureTextCol}>
              <Text style={styles.featureTitle}>The Wheel Strategy Suite</Text>
              <Text style={styles.featureDesc}>Track unlimited Wheel positions and cost basis. Free tier includes 1 saved wheel on this device. Deleting it does not unlock another.</Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={styles.featureIconBox}>
              <Shield color="#8B5CF6" size={20} />
            </View>
            <View style={styles.featureTextCol}>
              <Text style={styles.featureTitle}>Automated Expiration Push Alerts</Text>
              <Text style={styles.featureDesc}>Get background notifications before option expiration to lock in gains & avoid unwanted assignment.</Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={styles.featureIconBox}>
              <FileText color="#06B6D4" size={20} />
            </View>
            <View style={styles.featureTextCol}>
              <Text style={styles.featureTitle}>Full Lifetime History & PDF/CSV Export</Text>
              <Text style={styles.featureDesc}>Access your complete historical trade journal and export formatted PDF & CSV reports anytime.</Text>
            </View>
          </View>
        </View>

        {/* Pricing Tier Selector */}
        <View style={styles.plansContainer}>
          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'annual' && styles.selectedPlanCard]}
            onPress={() => setSelectedPlan('annual')}
            activeOpacity={0.8}
          >
            {selectedPlan === 'annual' && (
              <View style={styles.bestValueBadge}>
                <Text style={styles.bestValueText}>7 DAYS FREE • SAVE 33%</Text>
              </View>
            )}
            <View style={styles.planHeader}>
              <Text style={styles.planName}>Annual Pro</Text>
              <Text style={styles.planPrice}>{annualPriceStr}<Text style={styles.planPeriod}> / yr</Text></Text>
            </View>
            <Text style={styles.planSubtext}>7 days free, then {annualPriceStr}/year (billed annually)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'monthly' && styles.selectedPlanCard]}
            onPress={() => setSelectedPlan('monthly')}
            activeOpacity={0.8}
          >
            <View style={styles.planHeader}>
              <Text style={styles.planName}>Monthly Pro</Text>
              <Text style={styles.planPrice}>{monthlyPriceStr}<Text style={styles.planPeriod}> / mo</Text></Text>
            </View>
            <Text style={styles.planSubtext}>7 days free, then {monthlyPriceStr}/month (billed monthly)</Text>
          </TouchableOpacity>
        </View>

        {/* Purchase CTA Button */}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={handlePurchase}
          disabled={loading}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#10B981', '#059669']} style={styles.ctaGradient}>
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.ctaText}>
                Start 7-Day Free Trial
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Guarantee Banner */}
        <Text style={styles.guaranteeText}>
          🔒 Risk-Free • No charge for 7 days • Cancel anytime in App Store
        </Text>

        {/* Restore Purchases */}
        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={loading}>
          <Text style={styles.restoreText}>Restore Existing Purchases</Text>
        </TouchableOpacity>

        {/* Legal Disclaimer & Guideline 3.1.2 Links */}
        <Text style={styles.legalText}>
          Your 7-day free trial will automatically convert to a paid subscription ({annualPriceStr}/yr or {monthlyPriceStr}/mo) unless cancelled at least 24 hours before trial ends. Payment will be charged to your Apple ID Account at confirmation of purchase. Manage or cancel anytime in Apple ID Settings.
        </Text>

        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12, marginBottom: 8 }}>
          <TouchableOpacity onPress={() => Linking.openURL('https://senthilmkm.github.io/CashSecuredPut/terms.html')}>
            <Text style={{ color: '#94A3B8', fontSize: 12, textDecorationLine: 'underline' }}>Terms of Use (EULA)</Text>
          </TouchableOpacity>
          <Text style={{ color: '#64748B', marginHorizontal: 8, fontSize: 12 }}>•</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://senthilmkm.github.io/CashSecuredPut/privacy.html')}>
            <Text style={{ color: '#94A3B8', fontSize: 12, textDecorationLine: 'underline' }}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    padding: 8,
  },
  heroSection: {
    alignItems: 'center',
    marginVertical: 12,
  },
  crownCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  trialBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#451A03',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#D97706',
  },
  trialBadgeText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  freeTierLine: {
    fontSize: 12,
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 10,
    paddingHorizontal: 8,
  },
  featuresContainer: {
    backgroundColor: '#161E2E',
    borderRadius: 16,
    padding: 16,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  featureIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#0B0F19',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  featureTextCol: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
  },
  plansContainer: {
    marginBottom: 16,
  },
  planCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#1E293B',
    position: 'relative',
  },
  selectedPlanCard: {
    borderColor: '#10B981',
    backgroundColor: '#0F291E',
  },
  bestValueBadge: {
    position: 'absolute',
    top: -12,
    right: 16,
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  bestValueText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  planName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  planPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: '#10B981',
  },
  planPeriod: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '400',
  },
  planSubtext: {
    fontSize: 12,
    color: '#94A3B8',
  },
  ctaButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 4,
  },
  ctaGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '800',
  },
  guaranteeText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
  },
  restoreBtn: {
    alignItems: 'center',
    marginVertical: 14,
  },
  restoreText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  legalText: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 6,
  },
});