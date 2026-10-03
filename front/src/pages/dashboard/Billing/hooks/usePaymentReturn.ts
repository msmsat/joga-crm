import { useCallback, useEffect, useRef, useState } from 'react';
import { billingApi } from '../../../../api/billing/billing.api';
import type { Invoice } from '../../../../api/billing/billing.types';

const paymentProgress = (invoice: Invoice) => ['failed', 'paid', 'refunded'].indexOf(invoice.status) + 1;
const terminal = (invoice: Invoice) => paymentProgress(invoice) > 0;

/** A return URL identifies a purchase; an already active plan is not payment evidence. */
export function usePaymentReturn() {
  const [returned] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const rawId = params.get('invoice_id') ?? '';
    const id = /^[1-9]\d*$/.test(rawId) ? Number(rawId) : null;
    return { paymentReturn: params.get('payment') === 'return',
      invoiceId: id != null && Number.isSafeInteger(id) ? id : null };
  });
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const finished = useRef(false);
  const recordedProgress = useRef(0);
  const recordPaymentInvoice = useCallback((invoice: Invoice) => {
    if (!returned.paymentReturn || invoice.id !== returned.invoiceId) return;
    // Overlapping sync replies cannot undo verified payment or a terminal refund.
    const progress = paymentProgress(invoice);
    if (progress < recordedProgress.current) return;
    recordedProgress.current = progress;
    finished.current = terminal(invoice);
    setPaymentInvoice(invoice);
  }, [returned]);

  useEffect(() => {
    if (!returned.paymentReturn || returned.invoiceId == null) return;
    let current = true;
    let timer: number | undefined;
    let attempts = 0;
    finished.current = false;
    const check = async () => {
      if (!current || finished.current) return;
      attempts++;
      try {
        const invoice = await billingApi.syncInvoice(returned.invoiceId!);
        if (!current || finished.current) return;
        recordPaymentInvoice(invoice);
      } catch {
        // A network failure proves neither payment nor failure. The invoice
        // history keeps its manual reconciliation control after this window.
      }
      if (current && !finished.current && attempts < 7) timer = window.setTimeout(check, 4000);
    };
    void check();
    return () => { current = false; window.clearTimeout(timer); };
  }, [returned, recordPaymentInvoice]);

  const paymentStatus = paymentInvoice && terminal(paymentInvoice) ? paymentInvoice.status : 'processing';
  return { paymentReturn: returned.paymentReturn, paymentInvoice, paymentStatus, recordPaymentInvoice };
}
