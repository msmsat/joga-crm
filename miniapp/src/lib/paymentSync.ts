import { apiPost } from '../api/client';
import { accountId, getSession, studioOf } from './session';
import { bumpLessons } from './revision';
import { clearBookingCheckout, readBookingCheckout } from './bookingCheckout';

export type CheckoutTarget = { checkout_id?: number; reservation_id?: number };
export type CheckoutPayment = {
  id: number;
  kind: 'booking' | 'subscription';
  status: string;
  amount_str: string;
  title: string;
  starts_at?: string | null;
  reservation_id?: number | null;
  package_id?: number | null;
  created_at: string;
  newly_paid: boolean;
};
export type CheckoutSync = { payments: CheckoutPayment[]; verification_unavailable: boolean };
type Snapshot = { scope: string | null; payments: CheckoutPayment[]; success: CheckoutPayment | null; busy: boolean; error: boolean; awaiting: boolean };
type Stored = { hints: (CheckoutTarget & { time: number })[]; seen: number[] };
const EMPTY: Snapshot = { scope: null, payments: [], success: null, busy: false, error: false, awaiting: false };
const DAY = 86_400_000;
let snapshot = EMPTY;
let inFlight: { scope: string; target: string; promise: Promise<CheckoutSync | null> } | null = null;
const listeners = new Set<() => void>();
const memory = new Map<string, Stored>();
const successQueue = new Map<string, CheckoutPayment[]>();
const waitingDismissed = new Set<string>();
const telegramReturns = new Set<string>();

function scopeOf(): string | null {
  const session = getSession();
  return session ? `${studioOf(session.token) ?? 'studio'}:${accountId(session.token)}` : null;
}
function publish(next: Snapshot) {
  snapshot = next;
  listeners.forEach(listener => listener());
}
function storage(scope: string): Stored {
  let value: Stored = memory.get(scope) ?? { hints: [], seen: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(`velora:checkout:${scope}`) ?? 'null');
    if (Array.isArray(saved?.hints) && Array.isArray(saved?.seen)) value = {
      hints: saved.hints.filter((hint: Stored['hints'][number]) => hint && Number.isFinite(hint.time) && Date.now() - hint.time < DAY),
      seen: saved.seen.filter((id: unknown) => Number.isInteger(id)).slice(-50),
    };
  } catch { /* Private browsing may disable persistence; memory still works. */ }
  memory.set(scope, value);
  return value;
}
function save(scope: string, value: Stored) {
  memory.set(scope, value);
  try { localStorage.setItem(`velora:checkout:${scope}`, JSON.stringify(value)); } catch { /* optional */ }
}
function matches(payment: CheckoutPayment, hint: CheckoutTarget): boolean {
  return (hint.checkout_id != null && hint.checkout_id === payment.id)
    || (hint.reservation_id != null && hint.reservation_id === payment.reservation_id);
}

/** A hint requests verification; it is never evidence that money was received. */
export function rememberCheckout(target: CheckoutTarget) {
  const scope = scopeOf();
  if (!scope || (!target.checkout_id && !target.reservation_id)) return;
  waitingDismissed.delete(scope);
  const saved = storage(scope);
  save(scope, { ...saved, hints: [...saved.hints, { ...target, time: Date.now() }].slice(-10) });
  window.dispatchEvent(new Event('velora:checkout-started'));
}

/** The server already has an in-progress payment; retain its verification UI. */
export function awaitCheckout(target: CheckoutTarget) {
  const scope = scopeOf();
  if (scope) publish({ ...getPaymentSnapshot(), scope, awaiting: true });
  rememberCheckout(target);
}

export function getPaymentSnapshot(): Snapshot {
  return snapshot.scope === scopeOf() ? snapshot : EMPTY;
}
export function subscribePayments(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function dismissPaymentSuccess() {
  const current = getPaymentSnapshot();
  const queue = current.scope ? successQueue.get(current.scope) : undefined;
  publish({ ...current, success: queue?.shift() ?? null });
}

export function dismissPaymentWaiting() {
  const scope = scopeOf();
  if (scope) waitingDismissed.add(scope);
  if (scope) telegramReturns.delete(scope);
  const url = new URL(window.location.href);
  url.searchParams.delete('pay');
  url.searchParams.delete('checkout_id');
  window.history.replaceState(null, '', url.toString());
  publish({ ...getPaymentSnapshot(), awaiting: false });
}

/** Telegram's startapp parameter is a return hint, never payment evidence. */
export function notePaymentReturn(outcome: string | undefined) {
  const scope = scopeOf();
  if (scope && outcome === 'paysuccess' && !waitingDismissed.has(scope)) telegramReturns.add(scope);
}

/** Authenticated server verification, shared by return handling and manual checks. */
export async function syncCheckouts(target: CheckoutTarget = {}): Promise<CheckoutSync | null> {
  const scope = scopeOf();
  if (!scope) return null;
  const url = new URL(window.location.href);
  const returnId = Number(url.searchParams.get('checkout_id'));
  if (!target.checkout_id && !target.reservation_id && Number.isSafeInteger(returnId) && returnId > 0) {
    target = { checkout_id: returnId };
  }
  const targetKey = JSON.stringify(target);
  if (inFlight?.scope === scope) {
    if (inFlight.target === targetKey || targetKey === '{}') return inFlight.promise;
    await inFlight.promise.catch(() => undefined);
    if (scope !== scopeOf()) return null;
    return syncCheckouts(target);
  }
  const before = getPaymentSnapshot();
  const returning = !waitingDismissed.has(scope) && url.searchParams.get('pay') !== 'paycancel'
    && (url.searchParams.get('pay') === 'paysuccess' || returnId > 0 || telegramReturns.has(scope));
  publish({ ...before, scope, busy: true, error: false, awaiting: before.awaiting || returning });
  const request = (async () => {
    try {
      const result = await apiPost<CheckoutSync>('/global/checkout/sync', target);
      if (scope !== scopeOf()) return null;
      const draft = readBookingCheckout();
      if (draft && result.payments.some(payment => payment.status === 'paid'
        && payment.reservation_id === draft.booking.reservation_id)) clearBookingCheckout();
      const previous = new Map(before.payments.map(payment => [payment.id, payment.status]));
      const stored = storage(scope);
      const sorted = [...result.payments].sort((a, b) => b.id - a.id);
      const legacyReturn = (url.searchParams.get('pay') === 'paysuccess' || telegramReturns.has(scope)) && !returnId;
      const recentPaid = legacyReturn ? sorted.find(payment => payment.status === 'paid'
        && Date.now() - new Date(payment.created_at).getTime() < 60 * 60_000) : undefined;
      const confirmed = sorted.filter(payment => payment.status === 'paid' && !stored.seen.includes(payment.id) && (
        payment.newly_paid || previous.get(payment.id) === 'pending'
        || stored.hints.some(hint => matches(payment, hint))
        || payment.id === returnId || payment.id === recentPaid?.id
        || matches(payment, target)
      ));
      const queue = successQueue.get(scope) ?? [];
      queue.push(...confirmed);
      successQueue.set(scope, queue);
      const current = getPaymentSnapshot();
      const success = current.success ?? queue.shift() ?? null;
      if (confirmed.length) {
        stored.seen = [...stored.seen, ...confirmed.map(payment => payment.id)].slice(-50);
        // Remove only the completed attempt; other in-progress purchases remain tracked.
        stored.hints = stored.hints.filter(hint => !confirmed.some(payment => matches(payment, hint)));
        save(scope, stored);
        telegramReturns.delete(scope);
        url.searchParams.delete('pay');
        url.searchParams.delete('checkout_id');
        window.history.replaceState(null, '', url.toString());
      }
      // Targeted checks merge the other known purchases, rather than erasing them.
      const merged = new Map(before.payments.map(payment => [payment.id, payment]));
      result.payments.forEach(payment => merged.set(payment.id, payment));
      const payments = targetKey === '{}' ? result.payments : [...merged.values()];
      const awaiting = !waitingDismissed.has(scope) && (before.awaiting || returning) && !success
        && !result.payments.some(payment => payment.status === 'paid')
        && (result.payments.length === 0 || result.payments.some(payment => payment.status === 'pending'));
      publish({ scope, payments, success, awaiting,
        busy: false, error: result.verification_unavailable });
      if (confirmed.length || result.payments.some(payment => previous.get(payment.id) !== payment.status)) bumpLessons();
      return result;
    } catch (error) {
      if (scope === scopeOf()) publish({ ...getPaymentSnapshot(), busy: false, error: true });
      throw error;
    } finally {
      if (inFlight?.scope === scope && inFlight.target === targetKey) inFlight = null;
    }
  })();
  inFlight = { scope, target: targetKey, promise: request };
  return request;
}
