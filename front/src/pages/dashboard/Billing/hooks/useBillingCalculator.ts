import { useState, useEffect } from 'react';
import type { BillingMode, PlanType, BillingTab } from '../types';
import { plans, periodDiscounts } from '../constants';

export function useBillingCalculator() {
  const [billingMode, setBillingMode] = useState<BillingMode>('subscription');
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('pro');
  const [selectedPeriod, setSelectedPeriod] = useState<1 | 6 | 12 | 24>(1);
  const [fixedAmount, setFixedAmount] = useState(5000);
  const [percentAmount, setPercentAmount] = useState(5);
  const [estimatedRevenue, setEstimatedRevenue] = useState(300000);
  const [activeTab, setActiveTab] = useState<BillingTab>('plans');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [animateCards, setAnimateCards] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimateCards(true), 100);
    return () => clearTimeout(t);
  }, []);

  const getPrice = (plan: PlanType, period: number) => {
    const base = plans[plan].monthly;
    const disc = periodDiscounts[period] || 0;
    return Math.round(base * (1 - disc));
  };

  const currentMonthly = plans[selectedPlan].monthly;
  const discountedPrice = getPrice(selectedPlan, selectedPeriod);
  const totalToPay = discountedPrice * selectedPeriod;
  const savedTotal = currentMonthly * selectedPeriod - totalToPay;

  return {
    billingMode, setBillingMode,
    selectedPlan, setSelectedPlan,
    selectedPeriod, setSelectedPeriod,
    fixedAmount, setFixedAmount,
    percentAmount, setPercentAmount,
    estimatedRevenue, setEstimatedRevenue,
    activeTab, setActiveTab,
    showUpgradeModal, setShowUpgradeModal,
    animateCards,
    getPrice, periodDiscounts,
    currentMonthly, discountedPrice, totalToPay, savedTotal,
  };
}
