import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { billingApi } from '../../../../api/billing/billing.api';
import type { BillingProfileInput, CheckoutResponse } from '../../../../api/billing/billing.types';
import { errorMessage } from '../../../../api/errorMessage';

const paymentReturnPath = (invoiceId?: number | null) => {
  const params = new URLSearchParams({ payment: 'return' });
  if (invoiceId != null) params.set('invoice_id', String(invoiceId));
  return `/dashboard/billing?${params}`;
};

export function useCheckoutPage() {
  const { t } = useTranslation('billing');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const catalog = useQuery({ queryKey: ['billing', 'catalog'], queryFn: billingApi.getPlans });
  const profile = useQuery({ queryKey: ['billing', 'profile'], queryFn: billingApi.getBillingProfile });
  const plans = catalog.data?.plans ?? [];
  const plan = plans.find(p => p.id === params.get('plan')) ?? plans[0];
  const discounts = catalog.data?.period_discounts ?? {};
  const requestedPeriod = Number(params.get('period'));
  const period = requestedPeriod in discounts ? requestedPeriod : 1;
  const combo = params.get('combo') === 'true';
  const comboTermsKey = catalog.data ? `${catalog.data.combo_rate}:${catalog.data.grace_days}` : null;
  const [acceptedComboTerms, setAcceptedComboTerms] = useState<string | null>(null);
  const comboAccepted = acceptedComboTerms !== null && acceptedComboTerms === comboTermsKey;
  const [session, setSession] = useState<CheckoutResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const preview = useQuery({
    queryKey: ['billing', 'checkout-quote', plan?.id, period, combo, profile.dataUpdatedAt],
    queryFn: () => billingApi.previewCheckout(plan!.id, period, combo),
    enabled: !!plan,
  });
  const prepare = async (input: BillingProfileInput) => {
    if (pending.current || !plan) return;
    if (combo && !comboAccepted) { setError(t('mode.termsConfirm')); return; }
    pending.current = true;
    setBusy(true); setError('');
    try {
      const savedProfile = await billingApi.saveBillingProfile(input);
      await queryClient.cancelQueries({ queryKey: ['billing', 'profile'], exact: true });
      queryClient.setQueryData(['billing', 'profile'], savedProfile);
      // Combo activation only records consent; paid access still requires payment.
      // Save the payer first: the consent endpoint requires complete billing details.
      if (combo) await billingApi.activateModel({ mode: 'combo', accept_offline_terms: true });
      const result = await billingApi.checkout(plan.id, period, combo, 'elements');
      if (!result.client_secret) { navigate(paymentReturnPath(result.invoice_id), { replace: true }); return; }
      setSession(result);
    } catch (err) { setError(errorMessage(err, t)); throw err; }
    finally { pending.current = false; setBusy(false); }
  };
  return {
    catalog, profile, preview, plan, period, combo, session, busy, error,
    comboAccepted, setComboAccepted: (accepted: boolean) => setAcceptedComboTerms(accepted ? comboTermsKey : null),
    prepare, back: () => navigate('/dashboard/billing'),
    editProfile: () => { if (!busy) { setSession(null); setError(''); } },
    completed: () => navigate(paymentReturnPath(session?.invoice_id), { replace: true }),
    returnUrl: `${window.location.origin}${paymentReturnPath(session?.invoice_id)}`,
  };
}
