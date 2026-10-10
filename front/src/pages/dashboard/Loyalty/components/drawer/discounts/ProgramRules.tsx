import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Input, Switch, useToast } from '../../../../../../components/ui/index';
import { loyaltyApi } from '../../../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../../../api/queryKeys';
import { errorMessage } from '../../../../../../api/errorMessage';
import type { DiscountConfig } from '../../../../../../api/loyalty/loyalty.types';
import s from './Discounts.module.css';
import { IconCoins, IconLayersStack } from './DiscountIcons';
import { useDiscountFormat } from './useDiscountFormat';

const CASHBACK_DEFAULT = 5;

/** Правила, общие для всех скидок: складываются ли они с другими и кешбэк
 *  баллами. Сохраняются сразу, без кнопки: это два переключателя и число. */
export default function ProgramRules({ config }: { config: DiscountConfig | null }) {
  const { t } = useTranslation(['loyalty', 'common']);
  const toast = useToast();
  const qc = useQueryClient();
  const f = useDiscountFormat();
  const [cashback, setCashback] = useState(String(config?.cashback_percent ?? CASHBACK_DEFAULT));

  const save = useMutation({
    mutationFn: (patch: Partial<DiscountConfig>) => loyaltyApi.updateDiscountConfig(patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.loyaltyConfigs });
      toast.success(t('loyalty:toasts.saved'));
    },
    onError: err => toast.error(errorMessage(err, t)),
  });

  const percent = Number(cashback);
  const percentValid = Number.isInteger(percent) && percent >= 1 && percent <= 100;
  const cashbackOn = config?.cashback_percent != null;
  const commitCashback = () => {
    if (cashbackOn && percentValid && percent !== config?.cashback_percent) save.mutate({ cashback_percent: percent });
  };

  return (
    <div className={s.rules}>
      <div className={s.rulesTitle}>{t('loyalty:discounts.rules.title')}</div>
      <div className={s.rule}>
        <span className={s.ruleIcon}><IconLayersStack /></span>
        <div className={s.ruleText}>
          <div className={s.ruleName}>{t('loyalty:discounts.rules.stackable')}</div>
          <div className={s.ruleSub}>
            {config?.stackable ? t('loyalty:discounts.rules.stackableOn') : t('loyalty:discounts.rules.stackableOff')}
          </div>
        </div>
        <Switch checked={!!config?.stackable} disabled={save.isPending}
                onChange={value => save.mutate({ stackable: value })} />
      </div>
      <div className={s.rule}>
        <span className={s.ruleIcon}><IconCoins /></span>
        <div className={s.ruleText}>
          <div className={s.ruleName}>{t('loyalty:discounts.rules.cashback')}</div>
          <div className={s.ruleSub}>{t('loyalty:discounts.rules.cashbackHint')}</div>
          {cashbackOn && (
            <div className={s.cashbackRow}>
              <div className={s.cashbackField}>
                <Input
                  value={cashback}
                  inputMode="numeric"
                  suffix="%"
                  onChange={value => setCashback(value.replace(/\D/g, '').slice(0, 3))}
                  onBlur={commitCashback}
                  onEnter={commitCashback}
                />
              </div>
              <span className={s.ruleSub}>
                {percentValid
                  ? t('loyalty:discounts.rules.cashbackExample', { amount: f.money(1000), count: percent * 10 })
                  : t('loyalty:validation.range1to100')}
              </span>
            </div>
          )}
        </div>
        <Switch
          checked={cashbackOn}
          disabled={save.isPending}
          onChange={value => save.mutate({ cashback_percent: value ? (percentValid ? percent : CASHBACK_DEFAULT) : null })}
        />
      </div>
    </div>
  );
}
