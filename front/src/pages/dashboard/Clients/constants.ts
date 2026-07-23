export const STATUSES = ['active', 'vip', 'new', 'inactive', 'frozen'] as const;

export const STATUS_COLORS: Record<string, string> = {
  active:   '#5BAB72',
  vip:      '#c8a84b',
  new:      '#4A80C4',
  inactive: '#999',
  frozen:   '#7b6cd4',
};

export const EVENT_FILTER_TABS = ['all', 'payment', 'visit', 'booking', 'cancel', 'bonus', 'freeze'] as const;

export const BONUS_OPTION_IDS = ['p200', 'p500', 'p1000'] as const;

export const BONUS_POINTS: Record<string, number> = {
  p200: 200,
  p500: 500,
  p1000: 1000,
};
