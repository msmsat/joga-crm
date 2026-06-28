import type { ClientListItem, ClientProfile } from '../../../../api/clients/clients.types'
import type { ClientData } from '../types'

// ─── Status helpers ───────────────────────────────────────────────────────────

export const STATUS_TO_LABEL: Record<string, string> = {
  active: 'Активный', vip: 'VIP', new: 'Новый',
  inactive: 'Неактивный', frozen: 'Заморожен',
}

export const BL_TO_STATUS: Record<string, string> = {
  'Активный': 'active', 'VIP': 'vip', 'Новый': 'new',
  'Неактивный': 'inactive', 'Заморожен': 'frozen',
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export const DEFAULT_COLORS = ['#E8825A', '#5BAA8C', '#C4975A', '#6B8CC4', '#C47888', '#8878B8']
const RU_MONTHS = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']

export function getInitials(name: string, lastName?: string | null): string {
  return ((name[0] ?? '') + ((lastName ?? '')[0] ?? '')).toUpperCase() || '?'
}

export function getFullName(name: string, lastName?: string | null): string {
  return `${name}${lastName ? ' ' + lastName : ''}`
}

export function getAvatarColor(id: number, color?: string | null): string {
  return color ?? DEFAULT_COLORS[id % DEFAULT_COLORS.length]
}

export function formatSpent(n: number): string {
  if (n >= 1_000_000) return `₽${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `₽${Math.round(n / 1_000)}K`
  return `₽${n}`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function getSubscription(sub?: { used: number; total: number } | null) {
  const abMax = sub?.total ?? 0
  const ab = sub ? sub.total - sub.used : 0
  return { ab, abMax }
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function mapListItem(item: ClientListItem): ClientData {
  return {
    ...item,
    last_name:         item.last_name         ?? undefined,
    phone:             item.phone             ?? undefined,
    email:             item.email             ?? undefined,
    avatar_color:      item.avatar_color      ?? undefined,
    last_visit_date:   item.last_visit_date   ?? undefined,
    registration_date: item.registration_date ?? undefined,
    active_subscription: item.active_subscription ?? undefined,
    frozen: item.status === 'frozen',
  }
}

export function mapProfile(profile: ClientProfile): ClientData {
  return {
    ...mapListItem(profile),
    birth_date: profile.birth_date ?? undefined,
    city:       profile.city       ?? undefined,
    source:     profile.source     ?? undefined,
    notes: profile.notes,
  }
}
