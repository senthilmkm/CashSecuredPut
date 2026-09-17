import React, { useState } from 'react';
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
import { Crown, Check, X, Shield, RefreshCw, Zap, TrendingUp, Sparkles } from 'lucide-react-native';
import { purchasePremiumPlan, restorePremiumPurchases } from '../services/purchases';

interface SubscriptionProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function Subscription({ onClose, onSuccess }: SubscriptionProps) {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const [loading, setLoading] = useState(false);

  const handlePurchase = async () => {
    setLoading(true);
    try {
      const planId = selectedPlan === 'annual' ? 'csp_annual_sub' : 'csp_monthly_sub';
      const success = await purchasePremiumPlan(planId);
      if (success) {
        Alert.alert('7-Day Free Trial Activated!', 'Welcome to CashSecuredProfit Pro. You have full access for 7 days free of charge.', [
          { text: 'OK', onPress: () => { onSuccess(); onClose(); } }
        ]);
      }
    } catch (error: any) {
      if (error.message !== 'USER_CANCELLED') {
        Alert.alert('Trial Activation Failed', error.message || 'Unable to activate trial. Please try again.');
      }
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
          { text: 'OK', onPress: () => { onSuccess(); onClose(); } }
        ]);
      } else {
        Alert.alert('No Subscription Found', 'No active Pro subscription was found for your Apple ID.');
      }
    } catch (error: any) {
      Alert.alert('Restore Error', error.message || 'Failed to restore purchases.');
    } finally {
      setLoading(false);
    }
  };

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
            Try 7 days free. Maximize your options yield & master The Wheel strategy with zero risk. Cancel anytime.
          </Text>
        </View>

        {/* Feature Highlights */}
        <View style={styles.featuresContainer}>
          <View style={styles.featureRow}>
            <View style={styles.featureIconBox}>
              <Zap color="#10B981" size={20} />
            </View>
            <View style={styles.featureTextCol}>
              <Text style={styles.featureTitle}>Unlimited Portfolio Tracking</Text>
              <Text style={styles.featureDesc}>Store and manage unlimited active Cash-Secured Put positions.</Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={styles.featureIconBox}>
              <RefreshCw color="#3B82F6" size={20} />
            </View>
            <View style={styles.featureTextCol}>
              <Text style={styles.featureTitle}>Roll Down & Out Calculator</Text>
              <Text style={styles.featureDesc}>Calculate net credits when adjusting strike prices & expiration dates.</Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={styles.featureIconBox}>
              <TrendingUp color="#F59E0B" size={20} />
            </View>
            <View style={styles.featureTextCol}>
              <Text style={styles.featureTitle}>The Wheel Strategy Bridge</Text>
              <Text style={styles.featureDesc}>Calculate net stock cost basis on assignment & link with Covered Call apps.</Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={styles.featureIconBox}>
              <Shield color="#8B5CF6" size={20} />
            </View>
            <View style={styles.featureTextCol}>
              <Text style={styles.featureTitle}>Expiration Push Notifications</Text>
              <Text style={styles.featureDesc}>Get background alerts before option expiration to lock in gains.</Text>
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
              <Text style={styles.planPrice}>$39.99<Text style={styles.planPeriod}> / yr</Text></Text>
            </View>
            <Text style={styles.planSubtext}>7 days free, then $3.33/month ($39.99 billed annually)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'monthly' && styles.selectedPlanCard]}
            onPress={() => setSelectedPlan('monthly')}
            activeOpacity={0.8}
          >
            <View style={styles.planHeader}>
              <Text style={styles.planName}>Monthly Pro</Text>
              <Text style={styles.planPrice}>$4.99<Text style={styles.planPeriod}> / mo</Text></Text>
            </View>
            <Text style={styles.planSubtext}>7 days free, then $4.99/month (billed monthly)</Text>
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
          Your 7-day free trial will automatically convert to a paid subscription ($39.99/yr or $4.99/mo) unless cancelled at least 24 hours before trial ends. Payment will be charged to your iTunes Account at confirmation of purchase. Manage or cancel in Apple ID Settings.
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