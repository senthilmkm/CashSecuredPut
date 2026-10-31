import { Platform } from 'react-native';
import Purchases, { PurchasesPackage, PurchasesStoreProduct } from 'react-native-purchases';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const REVENUECAT_API_KEYS = {
  apple: 'appl_ZbCxtdrMbIORlkCxysVNDhysoME', // Apple RevenueCat API key for CashSecuredProfit
  google: 'goog_placeholder_key_change_me',
};

export const PRODUCT_IDS = {
  ANNUAL: 'csp_annual_sub',
  MONTHLY: 'csp_monthly_sub',
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
    Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
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

export interface PlanDetails {
  identifier: string;
  priceString: string;
  package?: PurchasesPackage;
  product?: PurchasesStoreProduct;
}

export interface AvailablePlans {
  annual?: PlanDetails;
  monthly?: PlanDetails;
}

/**
 * Loads available subscription plans from RevenueCat offerings with direct StoreKit fallback.
 */
export async function getSubscriptionPlans(): Promise<AvailablePlans> {
  const result: AvailablePlans = {};

  if (Platform.OS === 'web' || isExpoGo) {
    return {
      annual: { identifier: PRODUCT_IDS.ANNUAL, priceString: '$39.99' },
      monthly: { identifier: PRODUCT_IDS.MONTHLY, priceString: '$4.99' },
    };
  }

  try {
    await initializePurchases();

    // 1. Attempt to load from RevenueCat Offerings
    try {
      const offerings = await Purchases.getOfferings();
      const candidatePackages: PurchasesPackage[] = [];

      if (offerings.current?.availablePackages) {
        candidatePackages.push(...offerings.current.availablePackages);
      }

      if (offerings.all) {
        for (const offering of Object.values(offerings.all)) {
          if (offering?.availablePackages) {
            for (const pkg of offering.availablePackages) {
              if (!candidatePackages.some(existing => existing.identifier === pkg.identifier)) {
                candidatePackages.push(pkg);
              }
            }
          }
        }
      }

      for (const pkg of candidatePackages) {
        const prodId = (pkg.product?.identifier || pkg.identifier || '').toLowerCase();
        if ((prodId.includes('annual') || prodId.includes('yearly') || pkg.packageType === 'ANNUAL') && !result.annual) {
          result.annual = {
            identifier: pkg.product?.identifier || PRODUCT_IDS.ANNUAL,
            priceString: pkg.product?.priceString || '$39.99',
            package: pkg,
            product: pkg.product,
          };
        } else if ((prodId.includes('monthly') || pkg.packageType === 'MONTHLY') && !result.monthly) {
          result.monthly = {
            identifier: pkg.product?.identifier || PRODUCT_IDS.MONTHLY,
            priceString: pkg.product?.priceString || '$4.99',
            package: pkg,
            product: pkg.product,
          };
        }
      }
    } catch (offeringsErr) {
      console.warn('[Purchases] Offerings fetch warning, falling back to direct StoreKit products:', offeringsErr);
    }

    // 2. Direct StoreKit products fallback if offerings didn't return both plans
    if (!result.annual || !result.monthly) {
      try {
        const products = await Purchases.getProducts([PRODUCT_IDS.ANNUAL, PRODUCT_IDS.MONTHLY]);
        for (const prod of products) {
          const prodId = (prod.identifier || '').toLowerCase();
          if ((prodId.includes('annual') || prodId.includes('yearly')) && !result.annual) {
            result.annual = {
              identifier: prod.identifier,
              priceString: prod.priceString,
              product: prod,
            };
          } else if (prodId.includes('monthly') && !result.monthly) {
            result.monthly = {
              identifier: prod.identifier,
              priceString: prod.priceString,
              product: prod,
            };
          }
        }
      } catch (productsErr) {
        console.warn('[Purchases] Direct products fetch warning:', productsErr);
      }
    }
  } catch (error) {
    console.warn('[Purchases] Error loading subscription plans:', error);
  }

  return result;
}

/**
 * Purchases a subscription package via RevenueCat Offerings or direct StoreKit product.
 */
export async function purchasePremiumPlan(planId: string): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) {
    // Development fallback toggle for Web & Expo Go
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
    return true;
  }

  try {
    await initializePurchases();
    const target = planId.toLowerCase();

    // Strategy 1: RevenueCat Offerings (current or any offering)
    try {
      const offerings = await Purchases.getOfferings();
      const allPackages: PurchasesPackage[] = [];

      if (offerings.current?.availablePackages) {
        allPackages.push(...offerings.current.availablePackages);
      }
      if (offerings.all) {
        for (const off of Object.values(offerings.all)) {
          if (off?.availablePackages) {
            allPackages.push(...off.availablePackages);
          }
        }
      }

      if (allPackages.length > 0) {
        let pkg = allPackages.find((p: PurchasesPackage) => {
          const prodId = (p.product?.identifier || '').toLowerCase();
          const pkgId = (p.identifier || '').toLowerCase();

          if (prodId === target || pkgId === target) return true;
          if (target.includes('monthly') && (prodId.includes('monthly') || pkgId.includes('monthly') || p.packageType === 'MONTHLY')) return true;
          if ((target.includes('annual') || target.includes('yearly')) &&
              (prodId.includes('annual') || prodId.includes('yearly') || pkgId.includes('annual') || pkgId.includes('yearly') || p.packageType === 'ANNUAL')) return true;

          return false;
        });

        if (!pkg && allPackages.length > 0) {
          pkg = allPackages[0];
        }

        if (pkg) {
          console.log('[Purchases] Launching Apple StoreKit purchase for package:', pkg.identifier);
          const { customerInfo } = await Purchases.purchasePackage(pkg);
          const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
          await AsyncStorage.setItem(STORAGE_KEY, isActive ? 'true' : 'false');
          return isActive;
        }
      }
    } catch (offeringPurchaseErr: any) {
      if (
        offeringPurchaseErr?.userCancelled ||
        offeringPurchaseErr?.message === 'USER_CANCELLED' ||
        offeringPurchaseErr?.code === Purchases.PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR
      ) {
        throw new Error('USER_CANCELLED');
      }
      console.warn('[Purchases] Offering purchase failed, attempting direct StoreKit product purchase:', offeringPurchaseErr);
    }

    // Strategy 2: Direct StoreKit Product Purchase
    try {
      const directProductId = target.includes('annual') ? PRODUCT_IDS.ANNUAL : PRODUCT_IDS.MONTHLY;
      const products = await Purchases.getProducts([directProductId, PRODUCT_IDS.ANNUAL, PRODUCT_IDS.MONTHLY]);

      let productToPurchase = products.find(p => p.identifier.toLowerCase() === directProductId.toLowerCase());
      if (!productToPurchase && products.length > 0) {
        productToPurchase = products[0];
      }

      if (productToPurchase) {
        console.log('[Purchases] Launching Apple StoreKit direct product purchase for:', productToPurchase.identifier);
        const { customerInfo } = await Purchases.purchaseStoreProduct(productToPurchase);
        const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
        await AsyncStorage.setItem(STORAGE_KEY, isActive ? 'true' : 'false');
        return isActive;
      }
    } catch (directErr: any) {
      if (
        directErr?.userCancelled ||
        directErr?.message === 'USER_CANCELLED' ||
        directErr?.code === Purchases.PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR
      ) {
        throw new Error('USER_CANCELLED');
      }
      throw directErr;
    }

    throw new Error('The subscription product is currently unavailable. Please verify your App Store connection and try again.');
  } catch (error: any) {
    if (
      error?.userCancelled ||
      error?.message === 'USER_CANCELLED' ||
      error?.code === Purchases.PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR
    ) {
      throw new Error('USER_CANCELLED');
    }
    console.warn('[Purchases] Native StoreKit purchase error:', error);
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
  } catch (error: any) {
    if (
      error?.userCancelled ||
      error?.code === Purchases.PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR
    ) {
      return false;
    }
    console.error('[Purchases] Restore failed:', error);
    throw error;
  }
}