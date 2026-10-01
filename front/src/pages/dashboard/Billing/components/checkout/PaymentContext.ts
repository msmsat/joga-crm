import { createContext } from 'react';
import type { PaymentUi } from './StripePayment';

export const PaymentContext = createContext<PaymentUi | undefined>(undefined);
