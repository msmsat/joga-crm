// Ключи методов оплаты операций (FN-3.3): фиксированный список, "" — старые/не указано.
export const PAYMENT_METHOD_KEYS = ['cash', 'card', 'qr', 'transfer', 'stripe', 'fondy'] as const;
export type PaymentMethodKey = typeof PAYMENT_METHOD_KEYS[number];
