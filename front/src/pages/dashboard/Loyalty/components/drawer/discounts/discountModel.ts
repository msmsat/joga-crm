import type {
  DiscountCampaign,
  DiscountCampaignPayload,
  DiscountSegment,
} from '../../../../../../api/loyalty/loyalty.types';
import type { SubscriptionPackage } from '../../../../../../api/catalog/catalog.types';

// ─── Черновик скидки ────────────────────────────────────────────────────────
// Форма держит строки как набраны (размер, минимальная сумма) — число из них
// собирает toPayload. Клиенты — с именами: их видно чипами без второго запроса.

export type DiscountType = DiscountCampaign['discount_type'];

export interface DiscountDraft {
  name: string;
  discount_type: DiscountType;
  value: string;
  valid_from: string | null;
  valid_until: string | null;
  applies_to: DiscountCampaign['applies_to'];
  service_ids: number[];
  package_ids: number[];
  audience: DiscountCampaign['audience'];
  segments: DiscountSegment[];
  clients: { id: number; name: string }[];
  birthday_window_days: number;
  min_purchase_amount: string;
  is_active: boolean;
}

// Порядок плиток групп в редакторе. Совпадает с SEGMENT_KEYS на сервере.
export const SEGMENTS: DiscountSegment[] = ['new', 'birthday', 'vip', 'active', 'inactive', 'has_subscription'];

export const emptyDraft = (): DiscountDraft => ({
  name: '',
  discount_type: 'percent',
  value: '',
  valid_from: null,
  valid_until: null,
  applies_to: 'all',
  service_ids: [],
  package_ids: [],
  audience: 'all',
  segments: [],
  clients: [],
  birthday_window_days: 3,
  min_purchase_amount: '',
  is_active: true,
});

export const draftOf = (c: DiscountCampaign): DiscountDraft => ({
  name: c.name,
  discount_type: c.discount_type,
  value: String(c.value),
  valid_from: c.valid_from,
  valid_until: c.valid_until,
  applies_to: c.applies_to,
  service_ids: c.service_ids,
  package_ids: c.package_ids,
  audience: c.audience,
  segments: c.segments,
  clients: c.clients,
  birthday_window_days: c.birthday_window_days,
  min_purchase_amount: c.min_purchase_amount == null ? '' : String(c.min_purchase_amount),
  is_active: c.is_active,
});

export const toPayload = (d: DiscountDraft): DiscountCampaignPayload => ({
  name: d.name.trim(),
  discount_type: d.discount_type,
  value: Number(d.value),
  valid_from: d.valid_from,
  valid_until: d.valid_until,
  applies_to: d.applies_to,
  // Списки «на что» и «кому» уходят, только когда действуют: скидка «на всё»
  // с забытым выбором услуг не должна хранить его как будто он что-то значит.
  service_ids: d.applies_to === 'selected' ? d.service_ids : [],
  package_ids: d.applies_to === 'selected' ? d.package_ids : [],
  audience: d.audience,
  segments: d.audience === 'segments' ? d.segments : [],
  client_ids: d.audience === 'clients' ? d.clients.map(c => c.id) : [],
  birthday_window_days: d.birthday_window_days,
  min_purchase_amount: d.min_purchase_amount.trim() === '' ? null : Number(d.min_purchase_amount),
  is_active: d.is_active,
});

// ─── Что заполнено ──────────────────────────────────────────────────────────
// Те же правила, что у сервера (schemas/loyalty/discounts.py): обязательные
// поля — название, размер, «на что» и «кому». Пометка «Обязательно» над полем
// становится фисташковой, когда оно выполнено.

export interface DraftChecks {
  name: boolean;
  value: boolean;
  scope: boolean;
  audience: boolean;
  period: boolean;
  minimum: boolean;
}

export function checksOf(d: DiscountDraft): DraftChecks {
  const value = Number(d.value);
  const minimum = d.min_purchase_amount.trim();
  return {
    name: d.name.trim().length > 0,
    value: Number.isInteger(value) && value >= 1 && (d.discount_type === 'amount' || value <= 100),
    scope: d.applies_to === 'all' || d.service_ids.length + d.package_ids.length > 0,
    audience: d.audience === 'all'
      || (d.audience === 'segments' && d.segments.length > 0)
      || (d.audience === 'clients' && d.clients.length > 0),
    period: !d.valid_from || !d.valid_until || d.valid_from <= d.valid_until,
    minimum: minimum === '' || (Number.isInteger(Number(minimum)) && Number(minimum) >= 1),
  };
}

export const REQUIRED: (keyof DraftChecks)[] = ['name', 'value', 'scope', 'audience'];
export const isValid = (c: DraftChecks) => Object.values(c).every(Boolean);

// ─── Даты ───────────────────────────────────────────────────────────────────
// Всё — строками 'YYYY-MM-DD' по местному календарю: сравниваются как строки,
// а в Date превращаются полднем, чтобы смена часов не сдвинула день.

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseDay = (value: string) => new Date(`${value}T12:00:00`);
export const addDays = (value: string, days: number) => {
  const d = parseDay(value);
  d.setDate(d.getDate() + days);
  return iso(d);
};
export const daysBetween = (from: string, to: string) =>
  Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
export const todayIso = () => iso(new Date());

export type PeriodPreset = 'none' | 'week' | 'month' | 'days30' | 'custom';

export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, today = todayIso()): [string | null, string | null] {
  if (preset === 'none') return [null, null];
  if (preset === 'week') return [today, addDays(today, 6)];
  if (preset === 'days30') return [today, addDays(today, 29)];
  const end = parseDay(today);
  return [today, iso(new Date(end.getFullYear(), end.getMonth() + 1, 0, 12))];
}

export function presetOf(d: Pick<DiscountDraft, 'valid_from' | 'valid_until'>, today = todayIso()): PeriodPreset {
  for (const preset of ['none', 'week', 'month', 'days30'] as const) {
    const [from, until] = presetRange(preset, today);
    if (from === d.valid_from && until === d.valid_until) return preset;
  }
  return 'custom';
}

// ─── Шаблоны ────────────────────────────────────────────────────────────────
// Пять частых скидок студии одним нажатием: черновик заполнен, остаётся
// проверить и сохранить. Название — из локали (discounts.templates.<key>.name).

export type TemplateKey = 'birthday' | 'newcomers' | 'comeback' | 'passes' | 'week';
export const TEMPLATES: TemplateKey[] = ['birthday', 'newcomers', 'comeback', 'passes', 'week'];

export function fromTemplate(key: TemplateKey, name: string, packages: SubscriptionPackage[]): DiscountDraft {
  const base = { ...emptyDraft(), name };
  const today = todayIso();
  switch (key) {
    case 'birthday':
      return { ...base, value: '15', audience: 'segments', segments: ['birthday'], birthday_window_days: 3 };
    case 'newcomers':
      return { ...base, value: '10', audience: 'segments', segments: ['new'] };
    case 'comeback':
      return { ...base, value: '20', audience: 'segments', segments: ['inactive'], valid_from: today, valid_until: addDays(today, 29) };
    case 'passes': {
      const ids = packages.filter(p => p.is_active).map(p => p.id);
      return { ...base, value: '10', applies_to: ids.length ? 'selected' : 'all', package_ids: ids };
    }
    case 'week':
      return { ...base, value: '15', valid_from: today, valid_until: addDays(today, 6) };
  }
}
