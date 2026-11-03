export const ENTITLEMENT_ID = 'Premium';

/**
 * Robustly checks if customer has active premium entitlement across case variations
 * ('Premium', 'premium', 'pro', 'pro_access') or any active entitlement in RevenueCat.
 * This guarantees zero user lockout regardless of entitlement casing.
 */
export function isCustomerEntitled(customerInfo: any): boolean {
  if (!customerInfo || !customerInfo.entitlements || !customerInfo.entitlements.active) {
    return false;
  }
  const active = customerInfo.entitlements.active;

  // 1. Direct match for configured ENTITLEMENT_ID ('Premium')
  if (active[ENTITLEMENT_ID] !== undefined) {
    return true;
  }

  // 2. Case-insensitive and alias matches
  const knownKeys = ['premium', 'pro', 'pro_access', 'csp_premium', 'cashsecuredprofit_premium'];
  for (const key of Object.keys(active)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'premium' || knownKeys.includes(lowerKey)) {
      return true;
    }
  }

  // 3. Fallback: If RevenueCat reports any active entitlement, grant subscriber access
  if (Object.keys(active).length > 0) {
    return true;
  }

  return false;
}
