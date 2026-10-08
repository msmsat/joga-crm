import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { hybridApi } from '../api/hybrid.api';
import type { BookingRead } from '../api/hybrid.types';
import { bumpLessons } from '../lib/revision';

/** A checkout return is a reason to read the booking, never proof of payment. */
export function useBookingPaymentStatus(
  isOpen: boolean,
  quoteId: string | null,
  booking: BookingRead | null,
  setBooking: Dispatch<SetStateAction<BookingRead | null>>,
) {
  const checking = useRef<number | null>(null);
  const [request, setRequest] = useState<{ id: number; busy: boolean; error: boolean } | null>(null);

  const checkPayment = useCallback(async () => {
    if (!quoteId || !booking || booking.status !== 'hold' || checking.current === booking.reservation_id) return;
    const id = booking.reservation_id;
    checking.current = id;
    setRequest({ id, busy: true, error: false });
    try {
      const current = await hybridApi.readQuote(quoteId);
      if (!('reservation_id' in current) || current.reservation_id !== id || !('status' in current)) return;
      setBooking(previous => previous?.reservation_id === id ? {
        ...current,
        // The status endpoint does not recreate a payment URL. Keep the original
        // session available until the server says payment is no longer required.
        payment_url: current.status === 'hold' ? current.payment_url ?? previous.payment_url : current.payment_url,
      } : previous);
      bumpLessons();
      setRequest({ id, busy: false, error: false });
    } catch {
      setRequest({ id, busy: false, error: true });
    } finally {
      if (checking.current === id) checking.current = null;
      setRequest(previous => previous?.id === id ? { ...previous, busy: false } : previous);
    }
  }, [quoteId, booking, setBooking]);

  useEffect(() => {
    if (!isOpen || booking?.status !== 'hold') return;
    const onVisible = () => { if (document.visibilityState === 'visible') void checkPayment(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isOpen, booking?.status, checkPayment]);

  const current = request?.id === booking?.reservation_id ? request : null;
  return { checkPayment, checkingPayment: current?.busy ?? false, paymentCheckError: current?.error ?? false };
}
