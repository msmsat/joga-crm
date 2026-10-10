import { useCallback, useEffect, useRef, useState } from 'react';
import { hybridApi } from '../api/hybrid.api';
import type { BookingRead } from '../api/hybrid.types';
import { clearBookingCheckout, readBookingCheckout, type BookingCheckout } from '../lib/bookingCheckout';
import { awaitCheckout, dismissPaymentWaiting, syncCheckouts } from '../lib/paymentSync';
import { bumpLessons } from '../lib/revision';

/** Cancel and browser Back restore the choice only after safely closing Stripe. */
export function useBookingCheckoutReturn(
  enabled: boolean,
  restore: (draft: BookingCheckout) => void,
  finish: (booking: BookingRead | null) => void,
) {
  const started = useRef(false);
  const busy = useRef(false);
  const callbacks = useRef({ restore, finish });
  useEffect(() => { callbacks.current = { restore, finish }; });
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [draft, setDraft] = useState<BookingCheckout | null>(null);

  const recover = useCallback(async (saved: BookingCheckout) => {
    if (busy.current) return;
    busy.current = true;
    setReturning(true);
    setError(false);
    setProcessing(false);
    try {
      const result = await hybridApi.checkoutReturn(saved.booking.reservation_id);
      if (result.status === 'hold') {
        // An asynchronous charge may already be processing. No new checkout.
        awaitCheckout({ reservation_id: result.reservation_id });
        setProcessing(true);
        return;
      }
      if (result.status === 'active' || result.status === 'pending' || result.status === 'attended') {
        await syncCheckouts({ reservation_id: result.reservation_id });
        callbacks.current.finish(result);
      } else {
        dismissPaymentWaiting();
        callbacks.current.finish(null);
      }
      clearBookingCheckout();
      setDraft(null);
      bumpLessons();
    } catch {
      setError(true);
    } finally {
      busy.current = false;
      setReturning(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const resume = () => {
      const saved = readBookingCheckout();
      const outcome = new URLSearchParams(window.location.search).get('pay');
      if (!saved || outcome === 'paysuccess' || busy.current) return;
      setDraft(saved);
      callbacks.current.restore(saved);
      // A cancel URL is only intent. Verify paid/processing/expired on server.
      void recover(saved);
    };
    if (!started.current) { started.current = true; resume(); }
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) resume(); };
    let left = document.visibilityState === 'hidden';
    const onVisible = () => {
      if (document.visibilityState === 'hidden') left = true;
      else if (left) { left = false; resume(); }
    };
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, recover]);

  useEffect(() => {
    if (!draft || !processing || returning) return;
    const timer = setTimeout(() => void recover(draft), 10_000);
    return () => clearTimeout(timer);
  }, [draft, processing, returning, recover]);

  return { returningToPayment: draft !== null, checkoutReturnBusy: returning,
    checkoutReturnError: error, checkoutProcessing: processing,
    retryCheckoutReturn: () => {
      const saved = draft ?? readBookingCheckout();
      if (saved) { setDraft(saved); void recover(saved); }
    } };
}
