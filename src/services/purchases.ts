import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REVENUECAT_API_KEYS = {
  apple: 'appl_FbcvOQteBpvPFXCEmGoVRGhlhUH', // Apple RevenueCat API key
  google: 'goog_placeholder_key_change_me',
};

const ENTITLEMENT_ID = 'Premium';
const STORAGE_KEY = '@CashSecuredProfit:is_premium';

/**
 * Initializes RevenueCat Purchases SDK.
 */
export async function initializePurchases(): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[Purchases] Web platform detected. SDK bypass active.');
    return;
  }

  const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEYS.apple : REVENUECAT_API_KEYS.google;

  try {
    Purchases.configure({ apiKey });
    console.log('[Purchases] RevenueCat SDK initialized for CashSecuredProfit.');
  } catch (error) {
    console.error('[Purchases] Failed to initialize RevenueCat:', error);
  }
}

/**
 * Checks if the user has active Premium entitlement.
 */
export async function checkPremiumStatus(): Promise<boolean> {
  if (Platform.OS === 'web') {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    return cached === 'true';
  }

  try {
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
  if (Platform.OS === 'web') {
    // Development fallback toggle
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
    return true;
  }

  try {
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
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    await AsyncStorage.setItem(STORAGE_KEY, isActive ? 'true' : 'false');
    return isActive;
  } catch (error) {
    console.error('[Purchases] Restore failed:', error);
    throw error;
  }
}