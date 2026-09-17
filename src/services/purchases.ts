import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const REVENUECAT_API_KEYS = {
  apple: 'appl_FbcvOQteBpvPFXCEmGoVRGhlhUH', // Apple RevenueCat API key
  google: 'goog_placeholder_key_change_me',
};

const ENTITLEMENT_ID = 'Premium';
const STORAGE_KEY = '@CashSecuredProfit:is_premium';

let isPurchasesConfigured = false;

const isExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';

/**
 * Initializes RevenueCat Purchases SDK.
 */
export async function initializePurchases(): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) {
    console.log('[Purchases] Web or Expo Go environment detected. Native RevenueCat SDK bypass active.');
    return false;
  }

  if (isPurchasesConfigured) {
    return true;
  }

  const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEYS.apple : REVENUECAT_API_KEYS.google;

  try {
    Purchases.configure({ apiKey });
    isPurchasesConfigured = true;
    console.log('[Purchases] RevenueCat SDK initialized for CashSecuredProfit.');
    return true;
  } catch (error) {
    console.error('[Purchases] Failed to initialize RevenueCat:', error);
    return false;
  }
}

/**
 * Checks if the user has active Premium entitlement.
 */
export async function checkPremiumStatus(): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    return cached === 'true';
  }

  try {
    const configured = await initializePurchases();
    if (!configured) {
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      return cached === 'true';
    }

    const customerInfo = await Purchases.getCustomerInfo();
    const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    await AsyncStorage.setItem(STORAGE_KEY, isActive ? 'true' : 'false');
    return isActive;
  } catch (error) {
    console.error('[Purchases] Error checking customer info:', error);
    try {
      const cachedValue = await AsyncStorage.getItem(STORAGE_KEY);
      return cachedValue === 'true';
    } catch (e) {
      return false;
    }
  }
}

/**
 * Purchase a subscription package via RevenueCat.
 */
export async function purchasePremiumPlan(planId: string): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) {
    // Development fallback toggle for Web & Expo Go sandbox
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
    return true;
  }

  try {
    await initializePurchases();
    const offerings = await Purchases.getOfferings();
    if (offerings.current !== null && offerings.current.availablePackages.length > 0) {
      const pkg = offerings.current.availablePackages.find((p: any) => {
        const prodId = p.product.identifier.toLowerCase();
        const pkgId = p.identifier.toLowerCase();
        const target = planId.toLowerCase();

        if (prodId === target || pkgId === target) return true;
        if (target.includes('monthly') && (prodId.includes('monthly') || pkgId.includes('monthly') || p.packageType === 'MONTHLY')) return true;
        if ((target.includes('annual') || target.includes('yearly')) && 
            (prodId.includes('annual') || prodId.includes('yearly') || pkgId.includes('annual') || pkgId.includes('yearly') || p.packageType === 'ANNUAL')) return true;

        return false;
      });

      if (pkg) {
        const { customerInfo } = await Purchases.purchasePackage(pkg);
        const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
        await AsyncStorage.setItem(STORAGE_KEY, isActive ? 'true' : 'false');
        return isActive;
      }
    }
    throw new Error('No active offerings found matching plan');
  } catch (error: any) {
    if (error.userCancelled) {
      throw new Error('USER_CANCELLED');
    }
    console.error('[Purchases] Purchase failed:', error);
    throw error;
  }
}

/**
 * Restores previous purchases.
 */
export async function restorePremiumPurchases(): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    return cached === 'true';
  }

  try {
    await initializePurchases();
    const customerInfo = await Purchases.restorePurchases();
    const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    await AsyncStorage.setItem(STORAGE_KEY, isActive ? 'true' : 'false');
    return isActive;
  } catch (error) {
    console.error('[Purchases] Restore failed:', error);
    throw error;
  }
}