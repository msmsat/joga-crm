import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../../../components/ui/index";

export function useBilling() {
  const { t } = useTranslation('settings');
  const toast = useToast();
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
    toast.success(t('billing.toast.cardAdded'));
    setIsAddingCard(false);
  };

  const replaceCard = () => {
    toast.success(t('billing.toast.cardReplaceStarted'));
    setIsAddingCard(true);
  };

  const applyBillingSettings = () => {
    toast.success(t('billing.toast.cycleChanged'));
    setIsManagingSub(false);
  };

  const upgradeToBusinessView = () => {
    toast.success(t('billing.toast.businessRequested'));
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
  };
}
