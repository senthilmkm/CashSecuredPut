export const ENTITLEMENT_ID = 'Premium';

/**
 * Grants Pro only when RevenueCat reports an active entitlement named Premium.
 * Other entitlements, aliases, and an empty active map do not qualify.
 */
export function isCustomerEntitled(customerInfo: any): boolean {
  if (!customerInfo || !customerInfo.entitlements || !customerInfo.entitlements.active) {
    return false;
  }
  const active = customerInfo.entitlements.active;
  const premiumKey = ENTITLEMENT_ID.toLowerCase();

  return Object.keys(active).some((key) => key.toLowerCase() === premiumKey);
}
