import { useState } from "react";

export function useBilling(triggerToast: (msg: string) => void) {
  const [billingView, setBillingView] = useState<"dashboard" | "tariffs">("dashboard");
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [isManagingSub, setIsManagingSub] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardFocused, setCardFocused] = useState("");

  const addCard = () => {
    triggerToast("Карта успешно добавлена и привязана");
    setIsAddingCard(false);
  };

  const replaceCard = () => {
    triggerToast("Запуск защищенного обновления реквизитов...");
    setIsAddingCard(true);
  };

  const applyBillingSettings = () => {
    triggerToast("Период подписки успешно изменен");
    setIsManagingSub(false);
  };

  const upgradeToBusinessView = () => {
    triggerToast("Заявка на тариф Business успешно подтверждена!");
    setBillingView("dashboard");
  };

  return {
    billingView, setBillingView,
    isAddingCard, setIsAddingCard,
    isManagingSub, setIsManagingSub,
    billingCycle, setBillingCycle,
    cardNumber, setCardNumber,
    cardName, setCardName,
    cardExpiry, setCardExpiry,
    cardCvc, setCardCvc,
    cardFocused, setCardFocused,
    addCard, replaceCard, applyBillingSettings, upgradeToBusinessView,
    triggerToast,
  };
}
