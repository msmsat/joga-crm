import type { ClientListItem, ClientProfile } from '../../../../api/clients/clients.types'
import type { ClientData } from '../types'
import i18n from '../../../../i18n'

// ─── Display helpers ──────────────────────────────────────────────────────────

export const DEFAULT_COLORS = ['#E8825A', '#5BAA8C', '#C4975A', '#6B8CC4', '#C47888', '#8878B8']

export function getInitials(name: string, lastName?: string | null): string {
  return ((name[0] ?? '') + ((lastName ?? '')[0] ?? '')).toUpperCase() || '?'
}

export function getFullName(name: string, lastName?: string | null): string {
  return `${name}${lastName ? ' ' + lastName : ''}`
}

export function getAvatarColor(id: number, color?: string | null): string {
  return color ?? DEFAULT_COLORS[id % DEFAULT_COLORS.length]
}

export function formatMoney(n: number, symbol = '₽'): string {
  if (n >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(1).replace('.0', '')}M`
  if (n >= 1_000) return `${symbol}${Math.round(n / 1_000)}K`
  return `${symbol}${n}`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
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
    subscription_alert: profile.subscription_alert ?? undefined,
    notes: profile.notes,
  }
}
