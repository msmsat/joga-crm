import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { loadStripe } from '@stripe/stripe-js/pure';
import type { Appearance, StripeExpressCheckoutElementConfirmEvent } from '@stripe/stripe-js';
import { CheckoutElementsProvider, useCheckoutElements, PaymentElement as CheckoutPaymentElement,
  ExpressCheckoutElement as CheckoutExpress } from '@stripe/react-stripe-js/checkout';
import { Elements, PaymentElement, ExpressCheckoutElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { BillingProfile, CheckoutResponse } from '../../../../../api/billing/billing.types';
import styles from './CheckoutPage.module.css';
import { PaymentContext } from './PaymentContext';
import { hasPayableTotal, uniformTaxRate, type PaymentAmounts } from './checkoutAmounts';

export interface PaymentUi extends PaymentAmounts {
  fields: ReactNode; submit: () => void; busy: boolean; ready: boolean;
  error: string;
}
interface Props {
  session: CheckoutResponse; profile: BillingProfile;
  returnUrl: string; onComplete: () => void;
  children: ReactNode;
}
const appearance: Appearance = {
  theme: 'night',
  variables: { colorPrimary: '#FCAE91', colorBackground: '#171717', colorText: '#F7F4F2',
    colorTextSecondary: '#A4A09D', colorDanger: '#D88C9A', fontFamily: 'Manrope, Inter, sans-serif',
    borderRadius: '10px', spacingUnit: '4px', fontSizeBase: '14px' },
  rules: {
    '.Input': { border: '1px solid #363330', boxShadow: 'none', padding: '14px' },
    '.Input:focus': { borderColor: '#FCAE91', boxShadow: '0 0 0 3px rgba(252,174,145,.12)' },
    '.Label': { color: '#CBC6C2', fontWeight: '500', marginBottom: '8px' },
    '.Tab': { backgroundColor: '#202020', borderColor: '#363330', boxShadow: 'none' },
    '.Tab--selected': { borderColor: '#FCAE91', backgroundColor: '#2D2521' },
    '.TabLabel': { color: '#CBC6C2' },
    '.TabLabel--selected': { color: '#FCAE91' },
    '.TabIcon--selected': { color: '#FCAE91' },
  },
};
const walletOptions = {
  buttonHeight: 50,
  buttonType: { applePay: 'buy' as const, googlePay: 'buy' as const, paypal: 'pay' as const },
  paymentMethodOrder: ['paypal', 'apple_pay', 'google_pay'],
  buttonTheme: { applePay: 'white' as const, googlePay: 'white' as const, paypal: 'gold' as const },
  paymentMethods: { applePay: 'auto' as const, googlePay: 'auto' as const, paypal: 'auto' as const,
    link: 'never' as const, amazonPay: 'never' as const, klarna: 'never' as const },
  layout: { maxColumns: 2, maxRows: 2, overflow: 'never' as const },
};
const paymentOptions = {
  layout: 'tabs' as const, paymentMethodOrder: ['card', 'paypal'],
  fields: { billingDetails: { name: 'never' as const, email: 'never' as const, address: 'never' as const } },
  wallets: { applePay: 'never' as const, googlePay: 'never' as const },
};
const address = (p: BillingProfile) => ({
  country: p.country!, line1: p.line1!, line2: p.line2 || '',
  city: p.city!, postal_code: p.postal_code!, state: '',
});

function SessionPayment(props: Props) {
  const { t } = useTranslation('billing');
  const result = useCheckoutElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wallets, setWallets] = useState(true);
  const pending = useRef(false);
  const confirm = async (event?: StripeExpressCheckoutElementConfirmEvent) => {
    if (result.type !== 'success' || pending.current) return;
    if (!hasPayableTotal(result.checkout.total.total.minorUnitsAmount)) {
      setError(t('checkout.invalidPaymentAmount')); event?.paymentFailed({ reason: 'fail' }); return;
    }
    pending.current = true; setBusy(true); setError('');
    try {
      const confirmation = await result.checkout.confirm({
        returnUrl: props.returnUrl, redirect: 'if_required',
        billingAddress: { address: address(props.profile) },
        ...(event ? { expressCheckoutConfirmEvent: event } : {}),
      });
      if (confirmation.type === 'error') { setError(confirmation.error.message); event?.paymentFailed({ reason: 'fail' }); }
      else props.onComplete();
    } catch (err) { setError(err instanceof Error ? err.message : 'Payment failed'); event?.paymentFailed({ reason: 'fail' }); }
    finally { pending.current = false; setBusy(false); }
  };
  return <PaymentContext.Provider value={{
    fields: result.type === 'error' ? null : <div className={styles.stripeFields} aria-busy={result.type === 'loading'}>
      <div className={styles.wallets} data-hidden={!wallets || undefined}>
        <CheckoutExpress options={walletOptions} onConfirm={confirm}
          onReady={e => setWallets(!!e.availablePaymentMethods && Object.values(e.availablePaymentMethods).some(Boolean))} />
      </div>
      <CheckoutPaymentElement options={paymentOptions} />
    </div>,
    submit: () => { void confirm(); }, busy,
    ready: result.type === 'success' && result.checkout.canConfirm && hasPayableTotal(result.checkout.total.total.minorUnitsAmount),
    error: result.type === 'error' ? result.error.message : error,
    net: result.type === 'success' ? result.checkout.total.subtotal.minorUnitsAmount : null,
    taxRate: result.type === 'success' && result.checkout.tax.status === 'ready' ? uniformTaxRate(result.checkout.taxAmounts) : null,
    total: result.type === 'success' ? result.checkout.total.total.minorUnitsAmount : null,
    tax: result.type === 'success' && result.checkout.tax.status === 'ready'
      ? result.checkout.total.taxExclusive.minorUnitsAmount + result.checkout.total.taxInclusive.minorUnitsAmount : null,
  }}>{props.children}</PaymentContext.Provider>;
}

function InvoicePayment(props: Props) {
  const { t } = useTranslation('billing');
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const [wallets, setWallets] = useState(true);
  const pending = useRef(false);
  const confirm = async (event?: StripeExpressCheckoutElementConfirmEvent) => {
    if (!stripe || !elements || pending.current) return;
    if (!hasPayableTotal(props.session.amount_due)) {
      setError(t('checkout.invalidPaymentAmount')); event?.paymentFailed({ reason: 'fail' }); return;
    }
    pending.current = true; setBusy(true); setError('');
    try {
      const validation = await elements.submit();
      if (validation.error) { setError(validation.error.message || 'Payment failed'); event?.paymentFailed({ reason: 'fail' }); return; }
      const result = await stripe.confirmPayment({ elements, clientSecret: props.session.client_secret!,
        confirmParams: { return_url: props.returnUrl, payment_method_data: { billing_details: { address: address(props.profile),
          ...(props.session.payer_name ? { name: props.session.payer_name } : {}),
          ...(props.session.payer_email ? { email: props.session.payer_email } : {}),
        } } },
        redirect: 'if_required',
      });
      if (result.error) { setError(result.error.message || 'Payment failed'); event?.paymentFailed({ reason: 'fail' }); }
      else props.onComplete();
    } catch (err) { setError(err instanceof Error ? err.message : 'Payment failed'); event?.paymentFailed({ reason: 'fail' }); }
    finally { pending.current = false; setBusy(false); }
  };
  return <PaymentContext.Provider value={{
    fields: <div className={styles.stripeFields}>
      <div className={styles.wallets} data-hidden={!wallets || undefined}>
        <ExpressCheckoutElement options={walletOptions} onConfirm={confirm}
          onReady={e => setWallets(!!e.availablePaymentMethods && Object.values(e.availablePaymentMethods).some(Boolean))} />
      </div>
      <PaymentElement options={{ ...paymentOptions, fields: { billingDetails: {
          address: 'never', name: props.session.payer_name ? 'never' : 'auto',
          email: props.session.payer_email ? 'never' : 'auto',
        } } }} onChange={e => setComplete(e.complete)} />
    </div>, submit: () => { void confirm(); }, busy, ready: !!stripe && complete && hasPayableTotal(props.session.amount_due),
    error, total: props.session.amount_due ?? null, tax: props.session.tax_amount ?? null,
    net: props.session.amount_due != null && props.session.tax_amount != null
      ? props.session.amount_due - props.session.tax_amount : null,
    taxRate: props.session.tax_rate_percent ?? null,
  }}>{props.children}</PaymentContext.Provider>;
}

export default function StripePayment(props: Props) {
  const stripe = useMemo(() => loadStripe(props.session.publishable_key!), [props.session.publishable_key]);
  const clientSecret = props.session.client_secret!;
  return props.session.payment_kind === 'checkout'
    ? <CheckoutElementsProvider stripe={stripe} options={{ clientSecret, elementsOptions: { appearance },
        defaultValues: { billingAddress: { address: address(props.profile) } }, adaptivePricing: { allowed: false } }}>
        <SessionPayment {...props} />
      </CheckoutElementsProvider>
    : <Elements stripe={stripe} options={{ clientSecret, appearance }}><InvoicePayment {...props} /></Elements>;
}
