import { useState } from 'react';

export function usePaymentCard() {
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts: string[] = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length > 0 ? parts.join(' ') : value;
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/[^0-9]/g, '');
    if (v.length >= 2) return `${v.slice(0, 2)}/${v.slice(2, 4)}`;
    return v;
  };

  const reset = () => {
    setIsAddingCard(false);
    setCardNumber('');
    setCardName('');
    setCardExpiry('');
    setCardCvc('');
  };

  return {
    isAddingCard, setIsAddingCard,
    cardNumber, setCardNumber,
    cardName, setCardName,
    cardExpiry, setCardExpiry,
    cardCvc, setCardCvc,
    focusedField, setFocusedField,
    formatCardNumber, formatExpiry,
    reset,
  };
}
