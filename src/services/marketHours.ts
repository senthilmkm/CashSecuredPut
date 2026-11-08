/**
 * Utility to evaluate US Equity Market Trading Sessions (NYSE / NASDAQ).
 * Timezone: Eastern Time (America/New_York)
 * Regular Hours: 9:30 AM - 4:00 PM ET (Monday - Friday).
 */

export interface MarketSessionStatus {
  isOpen: boolean;
  status: 'open' | 'closed_weekend' | 'closed_holiday' | 'pre_market' | 'after_hours';
  label: string;
  badgeBg: string;
  badgeTextColor: string;
}

export function getMarketSessionStatus(dateOverride?: Date): MarketSessionStatus {
  const now = dateOverride || new Date();

  // Format into Eastern Time (US/Eastern) parts
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';

  const weekday = getPart('weekday'); // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
  const month = parseInt(getPart('month'), 10);
  const day = parseInt(getPart('day'), 10);
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);

  // 1. Weekend Check (Saturday or Sunday)
  if (weekday === 'Sat' || weekday === 'Sun') {
    return {
      isOpen: false,
      status: 'closed_weekend',
      label: 'Market Closed • Weekend',
      badgeBg: 'rgba(148, 163, 184, 0.15)',
      badgeTextColor: '#94A3B8',
    };
  }

  // 2. Major Fixed / Observed US Market Holidays
  // New Year's (Jan 1), Juneteenth (Jun 19), Independence Day (Jul 4), Christmas (Dec 25)
  const isMajorFixedHoliday =
    (month === 1 && (day === 1 || (day === 2 && weekday === 'Mon'))) || // New Year's
    (month === 6 && (day === 19 || (day === 20 && weekday === 'Mon'))) || // Juneteenth
    (month === 7 && (day === 4 || (day === 5 && weekday === 'Mon'))) || // July 4th
    (month === 12 && (day === 25 || (day === 26 && weekday === 'Mon'))); // Christmas

  if (isMajorFixedHoliday) {
    return {
      isOpen: false,
      status: 'closed_holiday',
      label: 'Market Closed • Holiday',
      badgeBg: 'rgba(245, 158, 11, 0.15)',
      badgeTextColor: '#F59E0B',
    };
  }

  const timeMinutes = hour * 60 + minute;
  const marketOpenMinutes = 9 * 60 + 30; // 9:30 AM EST
  const marketCloseMinutes = 16 * 60; // 4:00 PM EST

  // 3. Pre-Market Session
  if (timeMinutes < marketOpenMinutes) {
    return {
      isOpen: false,
      status: 'pre_market',
      label: 'Pre-Market (Opens 9:30 AM ET)',
      badgeBg: 'rgba(245, 158, 11, 0.15)',
      badgeTextColor: '#F59E0B',
    };
  }

  // 4. After-Hours Session
  if (timeMinutes >= marketCloseMinutes) {
    return {
      isOpen: false,
      status: 'after_hours',
      label: 'Market Closed (Last Close)',
      badgeBg: 'rgba(148, 163, 184, 0.15)',
      badgeTextColor: '#94A3B8',
    };
  }

  // 5. Regular Trading Hours (Live)
  return {
    isOpen: true,
    status: 'open',
    label: 'Live Market (NYSE/NASDAQ)',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    badgeTextColor: '#10B981',
  };
}
