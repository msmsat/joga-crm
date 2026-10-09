import { useEffect, useSyncExternalStore } from 'react';
import { getPaymentSnapshot, notePaymentReturn, subscribePayments, syncCheckouts } from '../lib/paymentSync';

/** Reconcile on return until confirmed, with backoff. Hidden tabs do no work. */
export function usePaymentReconciliation(enabled: boolean, telegramReturn?: string) {
  const snapshot = useSyncExternalStore(subscribePayments, getPaymentSnapshot);
  useEffect(() => {
    if (!enabled) return;
    notePaymentReturn(telegramReturn);
    let disposed = false, running = false, remaining = 12;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (disposed || running || document.visibilityState === 'hidden') return;
      running = true;
      remaining--;
      try {
        const result = await syncCheckouts();
        const awaiting = getPaymentSnapshot().awaiting;
        if (!disposed && (remaining > 0 || awaiting) && (awaiting || result?.payments.some(payment => payment.status === 'pending'))) {
          timer = setTimeout(() => void run(), remaining > 0 ? 5000 : 15000);
        }
      } catch {
        if (!disposed && (remaining > 0 || getPaymentSnapshot().awaiting)) {
          timer = setTimeout(() => void run(), remaining > 0 ? 5000 : 15000);
        }
      } finally { running = false; }
    };
    const resume = () => {
      if (document.visibilityState === 'hidden') return;
      clearTimeout(timer);
      remaining = 12;
      void run();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('velora:checkout-started', resume);
    void run();
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('velora:checkout-started', resume);
    };
  }, [enabled, telegramReturn]);
  return snapshot;
}
