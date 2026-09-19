import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Shield,
  RotateCcw,
  RefreshCw,
  Target,
  DollarSign,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Module {
  id: string;
  title: string;
  subtitle: string;
  icon: any;
  iconColor: string;
  content: {
    heading: string;
    body: string;
    bullets?: string[];
    proTip?: string;
  }[];
}

const MODULES: Module[] = [
  {
    id: 'csp_basics',
    title: '1. Cash-Secured Put Mechanics',
    subtitle: 'Collateral requirements, net cost basis, and ROC calculations',
    icon: DollarSign,
    iconColor: '#10B981',
    content: [
      {
        heading: 'What is a Cash-Secured Put (CSP)?',
        body: 'A Cash-Secured Put involves selling an out-of-the-money (OTM) put option while holding enough cash collateral in your brokerage account to purchase 100 shares of the stock if assigned.',
        bullets: [
          'Collateral Required = Strike Price × 100 Shares per contract.',
          'Net Cost Basis = Strike Price - Premium Collected.',
          'Max Return on Capital (ROC) = Net Premium / Collateral Required.',
        ],
        proTip: 'Always sell CSPs on stocks you actively WANT to own long-term at a discount.',
      },
      {
        heading: 'Comparing CSP Income to Risk-Free Treasury Yields',
        body: 'Because your cash is locked up as collateral, evaluate your annualized APR against risk-free Treasury bills (e.g. 5.0%). Aim for CSP trades that deliver 15% to 30%+ annualized returns to justify the stock market risk.',
      },
    ],
  },
  {
    id: 'wheel_strategy',
    title: '2. The Option Wheel Strategy',
    subtitle: 'The ultimate 3-phase income loop for long-term investors',
    icon: RotateCcw,
    iconColor: '#3B82F6',
    content: [
      {
        heading: 'Phase 1: Sell Cash-Secured Puts',
        body: 'Sell OTM put options with 30–45 Days to Expiration (DTE). Collect premium while waiting to buy the stock at a discount.',
      },
      {
        heading: 'Phase 2: Accept Assignment & Hold Shares',
        body: 'If the stock price falls below your strike price at expiration, you are assigned 100 shares. Your actual cost basis is discounted by all previous put premiums collected.',
      },
      {
        heading: 'Phase 3: Sell Covered Calls',
        body: 'Sell out-of-the-money Covered Calls against your 100 shares. Continue generating premium income to relentlessly lower your net breakeven price until your shares are called away.',
        proTip: 'When your shares get called away, return to Phase 1 and start the Wheel again!',
      },
    ],
  },
  {
    id: 'rolling_tactics',
    title: '3. Rolling Down & Out Tactics',
    subtitle: 'How to manage losing positions and avoid unwanted assignment',
    icon: RefreshCw,
    iconColor: '#F59E0B',
    content: [
      {
        heading: 'When Should You Roll a CSP?',
        body: 'If the stock drops near or below your strike price and you want to prevent assignment, roll the trade down to a lower strike and out to a future expiration date.',
        bullets: [
          'Buy back existing Put for a debit (close trade).',
          'Sell new Put further out in time for a larger credit.',
          'Ensure the transaction yields a Net Credit whenever possible.',
        ],
        proTip: 'Rule of thumb: Roll when the trade has 7–14 days remaining before expiration (DTE) if the option goes in-the-money.',
      },
    ],
  },
  {
    id: 'delta_selection',
    title: '4. Strike & Delta Optimization',
    subtitle: 'Balancing Probability of Profit (POP) vs Premium Yield',
    icon: Target,
    iconColor: '#A855F7',
    content: [
      {
        heading: 'Understanding Put Delta',
        body: 'Put Delta estimates the probability of the option expiring in-the-money. A 0.20 Delta Put has approximately an 80% Probability of Profit (POP).',
        bullets: [
          'Conservative: 0.15 – 0.20 Delta (~80–85% win rate, safer buffer).',
          'Balanced: 0.25 – 0.30 Delta (~70–75% win rate, higher yield).',
          'Aggressive: > 0.35 Delta (Higher assignment risk).',
        ],
      },
    ],
  },
  {
    id: 'risk_management',
    title: '5. Downside & Cash Management',
    subtitle: 'Protecting capital and avoiding margin stress',
    icon: Shield,
    iconColor: '#EF4444',
    content: [
      {
        heading: 'Core Risk Rules for CSP Traders',
        body: 'Never sell CSPs right before earnings announcements without factoring in implied volatility crush. Keep 20%+ of your portfolio in uncommitted liquid reserves.',
        bullets: [
          'Avoid over-leveraging on a single stock ticker.',
          'Diversify across non-correlated market sectors.',
          'Earn interest on unassigned cash collateral (e.g. broker money market yields).',
        ],
      },
    ],
  },
];

export default function GuideCenter() {
  const [expandedId, setExpandedId] = useState<string>('csp_basics');

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? '' : id);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* HEADER */}
        <View style={styles.headerCard}>
          <View style={styles.headerTitleRow}>
            <BookOpen size={20} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={styles.headerTitle}>CSP & Wheel Masterclass Guide</Text>
          </View>
          <Text style={styles.headerSub}>
            Interactive strategy modules, probability calculations, rolling rules, and cash management tactics.
          </Text>
        </View>

        {/* MODULES LIST */}
        {MODULES.map((module) => {
          const isExpanded = expandedId === module.id;
          const IconComp = module.icon;

          return (
            <View key={module.id} style={styles.moduleCard}>
              <TouchableOpacity
                style={styles.moduleHeader}
                onPress={() => toggleExpand(module.id)}
                activeOpacity={0.8}
              >
                <View style={styles.moduleHeaderLeft}>
                  <View style={[styles.iconCircle, { backgroundColor: `${module.iconColor}20` }]}>
                    <IconComp size={18} color={module.iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.moduleTitle}>{module.title}</Text>
                    <Text style={styles.moduleSub}>{module.subtitle}</Text>
                  </View>
                </View>

                {isExpanded ? (
                  <ChevronUp size={18} color="#94A3B8" />
                ) : (
                  <ChevronDown size={18} color="#94A3B8" />
                )}
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.moduleBody}>
                  {module.content.map((sec, idx) => (
                    <View key={idx} style={styles.sectionBlock}>
                      <Text style={styles.sectionHeading}>{sec.heading}</Text>
                      <Text style={styles.sectionBody}>{sec.body}</Text>

                      {sec.bullets && sec.bullets.length > 0 && (
                        <View style={styles.bulletList}>
                          {sec.bullets.map((bullet, bIdx) => (
                            <Text key={bIdx} style={styles.bulletItem}>
                              • {bullet}
                            </Text>
                          ))}
                        </View>
                      )}

                      {sec.proTip && (
                        <View style={styles.tipBox}>
                          <Lightbulb size={14} color="#F59E0B" style={{ marginRight: 6 }} />
                          <Text style={styles.tipText}>
                            <Text style={{ fontWeight: '800', color: '#F59E0B' }}>PRO TIP: </Text>
                            {sec.proTip}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
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
  headerCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#F8FAFC',
  },
  headerSub: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 17,
  },
  moduleCard: {
    backgroundColor: '#161E2E',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  moduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  moduleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  moduleTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  moduleSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  moduleBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#0B0F19',
  },
  sectionBlock: {
    marginTop: 12,
  },
  sectionHeading: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#3B82F6',
    marginBottom: 4,
  },
  sectionBody: {
    fontSize: 12.5,
    color: '#CBD5E1',
    lineHeight: 18,
  },
  bulletList: {
    marginTop: 6,
    paddingLeft: 6,
  },
  bulletItem: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 2,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#451A03',
    padding: 9,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#7C2D12',
  },
  tipText: {
    fontSize: 11.5,
    color: '#FEF3C7',
    flex: 1,
    lineHeight: 16,
  },
});
