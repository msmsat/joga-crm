import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "../../../../components/ui/index";
import { billingApi } from "../../../../api/billing/billing.api";
import { queryKeys } from "../../../../api/queryKeys";
import { errorMessage } from "../../../../api/errorMessage";
import type { AutopaySettings, BillingPlan } from "../../../../api/billing/billing.types";

// Вкладка «Подписка» — сводка + вход в /dashboard/billing (эпик 4). Калькулятор
// периодов, сравнение тарифов и форма карты там же — здесь не дублируются.
export function useBilling() {
  const qc = useQueryClient();
  const { t } = useTranslation('settings');
  const toast = useToast();

  const plan = useQuery({ queryKey: queryKeys.billingPlan, queryFn: () => billingApi.getPlan() });
  const invoices = useQuery({
    queryKey: queryKeys.billingInvoices(12),
    queryFn: () => billingApi.getInvoices({ limit: 12 }),
  });
  const cards = useQuery({ queryKey: queryKeys.billingCards, queryFn: () => billingApi.getPaymentCards() });

  // Оптимистичный флип свитча (роадмап SETTINGS, общее решение №3) — мгновенный
  // отклик, откат по onError.
  const setAutopay = useMutation({
    mutationFn: (patch: Partial<AutopaySettings>) => billingApi.updateAutopay(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: queryKeys.billingPlan });
      const prev = qc.getQueryData<BillingPlan>(queryKeys.billingPlan);
      if (prev) qc.setQueryData<BillingPlan>(queryKeys.billingPlan, { ...prev, ...patch });
      return { prev };
    },
    onError: (err, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.billingPlan, ctx.prev);
      toast.error(errorMessage(err, t));
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.billingPlan, data);
      toast.success(t('billing.toast.autopaySaved'));
    },
  });

  // «Продлить» для просроченной подписки (edge case: status != active).
  const renew = useMutation({
    mutationFn: () => billingApi.renew(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.billingPlan });
      qc.invalidateQueries({ queryKey: queryKeys.billingInvoicesAll });
      toast.success(t('billing.toast.renewed'));
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  return { plan, invoices, cards, setAutopay, renew };
}
