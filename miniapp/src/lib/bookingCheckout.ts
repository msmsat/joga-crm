import type { BookingRead, ClientConfirmPayment } from '../api/hybrid.types';
import type { WizardPick } from './wizard';
import { accountId, getSession, studioOf } from './session';

export type BookingCheckout = {
  pick: WizardPick; scope: number | null; booking: BookingRead;
  payment: ClientConfirmPayment | null; path: string; created: number;
};
let memory: { key: string; draft: BookingCheckout } | null = null;
function key() {
  const session = getSession();
  return session ? `velora:booking-checkout:${studioOf(session.token)}:${accountId(session.token)}` : null;
}

/** A tab-local choice to restore after Stripe. Payment truth stays on the server. */
export function rememberBookingCheckout(draft: Omit<BookingCheckout, 'path' | 'created'>) {
  const id = key();
  if (!id) return;
  const value = { ...draft, path: window.location.pathname, created: Date.now() };
  memory = { key: id, draft: value };
  try { sessionStorage.setItem(id, JSON.stringify(value)); } catch { /* memory supports browser Back */ }
}
export function readBookingCheckout(): BookingCheckout | null {
  const id = key();
  if (!id) return null;
  try {
    const value = memory?.key === id ? memory.draft : JSON.parse(sessionStorage.getItem(id) ?? 'null');
    if (!value || value.path !== window.location.pathname || !Number.isFinite(value.created)
      || Date.now() - value.created > 86_400_000 || value.created > Date.now()
      || !Number.isSafeInteger(value.booking?.reservation_id) || value.booking.reservation_id <= 0
      || value.booking.status !== 'hold' || !/^\d{4}-\d{2}-\d{2}$/.test(value.pick?.day)
      || !Number.isInteger(value.pick?.time) || value.pick.time < 0 || value.pick.time >= 1440
      || !Number.isSafeInteger(value.pick?.serviceId)) return null;
    return value;
  } catch { return null; }
}
export function clearBookingCheckout() {
  const id = key();
  if (memory?.key === id) memory = null;
  try { if (id) sessionStorage.removeItem(id); } catch { /* optional */ }
}
