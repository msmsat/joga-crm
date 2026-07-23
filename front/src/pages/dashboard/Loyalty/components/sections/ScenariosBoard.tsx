import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import styles from '../../Loyalty.module.css';
import { loyaltyApi } from '../../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../../api/queryKeys';
import { errorMessage } from '../../../../../api/errorMessage';
import { useToast } from '../../../../../components/ui/Toast';
import { Dialog, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, ConfirmModal } from '../../../../../components/ui/index';
import type { Scenario, ScenarioTrigger, ScenarioAction, ScenarioTemplate } from '../../../../../api/loyalty/loyalty.types';

// Какой числовой параметр в фразе редактируется у каждого триггера/действия.
// Ключ должен совпадать с ключом в trigger_params / action_params на бэке.
const TRIGGER_FIELD: Record<ScenarioTrigger, string | null> = {
  inactive_days: 'days',
  low_subscription: 'classes_left',
  birthday: null,
  nth_visit: 'n',
  referral: null,
};
const ACTION_FIELD: Record<ScenarioAction, string | null> = {
  points: 'points',
  gift_classes: 'classes',
  certificate: 'amount',
  renewal_offer: 'discount',
};
const TEMPLATE_KEYS: ScenarioTemplate[] = ['win_back', 'expiring_subscription', 'birthday_gift', 'fifth_visit', 'referral_thanks'];

// Каналы: email и telegram живые (deliver() реально шлёт), whatsapp — до интеграции.
const CHANNELS: { key: string; live: boolean }[] = [
  { key: 'email', live: true },
  { key: 'telegram', live: true },
  { key: 'whatsapp', live: false },
];

// Инлайн-инпут числа прямо во фразе. Патчит на blur/Enter, если значение изменилось.
function InlineNumber({ value, min, max, onCommit, disabled }: {
  value: number; min: number; max?: number; disabled: boolean; onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    let n = Math.round(Number(draft));
    if (!Number.isFinite(n) || n < min) n = min;
    if (max !== undefined && n > max) n = max;
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      value={draft}
      disabled={disabled}
      min={min}
      max={max}
      onChange={e => {
        const digitsOnly = e.target.value.replace(/[^0-9]/g, '');
        setDraft(digitsOnly);
      }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={`${styles.inlineNum} ${disabled ? styles.inlineNumDisabled : ''}`}
      style={{ '--num-w': `${draft.length + 1}ch` } as React.CSSProperties}
    />
  );
}

function ToggleSwitch({ on, disabled, onToggle }: { on: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`${styles.toggle} ${on ? styles.toggleOn : ''} ${disabled ? styles.toggleDisabled : ''}`}
    >
      <span className={`${styles.toggleKnob} ${on ? styles.toggleKnobOn : ''}`} />
    </button>
  );
}

export default function ScenariosBoard() {
  const { t } = useTranslation('loyalty');
  const toast = useToast();
  const qc = useQueryClient();

  const { data: scenarios = [], isError } = useQuery({
    queryKey: queryKeys.loyaltyScenarios,
    queryFn: () => loyaltyApi.getScenarios(),
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [template, setTemplate] = useState<ScenarioTemplate>('win_back');
  const [toDelete, setToDelete] = useState<Scenario | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.loyaltyScenarios });

  const createMut = useMutation({
    mutationFn: (tpl: ScenarioTemplate) => loyaltyApi.createScenario(tpl),
    onSuccess: () => { invalidate(); toast.success(t('scenarios.toasts.created')); setPickerOpen(false); },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof loyaltyApi.updateScenario>[1] }) =>
      loyaltyApi.updateScenario(id, payload),
    onSuccess: () => invalidate(),
    // При ошибке возвращаем список к серверному состоянию (инпут откатится) и жалуемся.
    onError: () => { invalidate(); toast.error(t('scenarios.toasts.failed')); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => loyaltyApi.deleteScenario(id),
    onSuccess: () => { invalidate(); toast.success(t('scenarios.toasts.deleted')); setToDelete(null); },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null;

  const patchTrigger = (s: Scenario, val: number) => {
    const field = TRIGGER_FIELD[s.trigger_type];
    if (field) updateMut.mutate({ id: s.id, payload: { trigger_params: { [field]: val } } });
  };
  const patchAction = (s: Scenario, val: number) => {
    const field = ACTION_FIELD[s.action_type];
    if (field) updateMut.mutate({ id: s.id, payload: { action_params: { [field]: val } } });
  };

  // Число в фразе заменяем на инлайн-инпут: интерполируем сентинел (которого нет
  // в тексте), режем по нему — получаем [до, после] вокруг места для инпута.
  const SENTINEL = '⁣';
  const splitAround = (key: string, field: string | null): [string, string] => {
    if (!field) return [t(key), ''];
    const [before, after = ''] = t(key, { [field]: SENTINEL }).split(SENTINEL);
    return [before, after];
  };

  const renderSentence = (s: Scenario) => {
    const tField = TRIGGER_FIELD[s.trigger_type];
    const aField = ACTION_FIELD[s.action_type];
    const disabled = !s.is_enabled;
    const [tBefore, tAfter] = splitAround(`scenarios.triggers.${s.trigger_type}`, tField);
    const [aBefore, aAfter] = splitAround(`scenarios.actions.${s.action_type}`, aField);

    return (
      <span style={{ fontSize: '13.5px', fontWeight: 600, color: disabled ? 'var(--text3)' : 'var(--text)', lineHeight: 1.9 }}>
        <span style={{ color: 'var(--text3)', fontWeight: 500 }}>{t('scenarios.ifClient')} </span>
        {tBefore}
        {tField && (
          <InlineNumber
            value={s.trigger_params[tField] ?? 1} min={1} disabled={disabled}
            onCommit={(v) => patchTrigger(s, v)}
          />
        )}
        {tAfter}
        <span style={{ color: '#F9A08B', fontWeight: 800, margin: '0 6px' }}>{'→'}</span>
        {aBefore}
        {aField && (
          <InlineNumber
            value={s.action_params[aField] ?? (aField === 'discount' ? 0 : 1)}
            min={aField === 'discount' ? 0 : 1} max={aField === 'discount' ? 100 : undefined}
            disabled={disabled} onCommit={(v) => patchAction(s, v)}
          />
        )}
        {aAfter}
      </span>
    );
  };

  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800 }}>{t('scenarios.title')}</div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{t('scenarios.subtitle')}</div>
        </div>
        <button
          onClick={() => setPickerOpen(true)}
          className={styles.configureBtn}
          style={{ background: 'linear-gradient(135deg, #FCAE91, #F9A08B)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          {t('scenarios.add')}
        </button>
      </div>

      {isError && <div style={{ fontSize: '12px', color: '#D88C9A', marginBottom: '12px' }}>{t('toasts.loadFailed')}</div>}

      {scenarios.length === 0 ? (
        <div className={styles.statCard} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '40px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{t('scenarios.empty')}</div>
          <div style={{ fontSize: '12px', opacity: 0.7 }}>{t('scenarios.emptySub')}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '14px' }}>
          {scenarios.map(s => (
            <div key={s.id} className={`${styles.scenarioCard} ${!s.is_enabled ? styles.scenarioCardDisabled : ''}`}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>{renderSentence(s)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <ToggleSwitch on={s.is_enabled} disabled={updateMut.isPending} onToggle={() => updateMut.mutate({ id: s.id, payload: { is_enabled: !s.is_enabled } })} />
                  <button onClick={() => setToDelete(s)} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }} title={t('scenarios.deleteConfirm')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--text3)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#5BAB72' }} />Email
                </span>
                <span>{t('scenarios.fired', { count: s.fired_count })}</span>
                <span>{'·'} {s.last_run_at ? t('scenarios.lastRun', { when: fmtDate(s.last_run_at) }) : t('scenarios.neverRun')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {pickerOpen && (
        <Dialog onClose={() => setPickerOpen(false)}>
          <ModalHeader title={t('scenarios.pickTemplate')} subtitle={t('scenarios.pickTemplateSub')} />
          <ModalBody>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
              {TEMPLATE_KEYS.map(tpl => {
                const active = tpl === template;
                return (
                  <button
                    key={tpl}
                    onClick={() => setTemplate(tpl)}
                    style={{
                      textAlign: 'left', padding: '14px 16px', borderRadius: '12px', cursor: 'pointer',
                      border: `1.5px solid ${active ? 'rgba(252,174,145,0.6)' : 'var(--border)'}`,
                      background: active ? 'rgba(252,174,145,0.08)' : 'var(--bg)',
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 700, color: active ? '#F9A08B' : 'var(--text)' }}>{t(`scenarios.templates.${tpl}.name`)}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '3px' }}>{t(`scenarios.templates.${tpl}.desc`)}</div>
                  </button>
                );
              })}
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 8px' }}>{t('scenarios.channel')}</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {CHANNELS.map(ch => (
                  <div
                    key={ch.key}
                    style={{
                      padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
                      border: `1.5px solid ${ch.live ? 'rgba(91,171,114,0.4)' : 'var(--border)'}`,
                      background: ch.live ? 'rgba(91,171,114,0.1)' : 'var(--bg)',
                      color: ch.live ? '#5BAB72' : 'var(--text3)', opacity: ch.live ? 1 : 0.55,
                      display: 'flex', flexDirection: 'column', gap: '2px',
                    }}
                    title={ch.live ? undefined : t('scenarios.channelSoon')}
                  >
                    <span style={{ textTransform: 'capitalize' }}>{ch.key}</span>
                    {!ch.live && <span style={{ fontSize: '9px', fontWeight: 500 }}>{t('scenarios.channelSoon')}</span>}
                  </div>
                ))}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <GhostButton>{t('drawer.cancel')}</GhostButton>
            <PrimaryButton onClick={() => createMut.mutate(template)} loading={createMut.isPending}>{t('scenarios.create')}</PrimaryButton>
          </ModalFooter>
        </Dialog>
      )}

      {toDelete && (
        <ConfirmModal
          danger
          title={t('scenarios.deleteConfirm')}
          message={t('scenarios.deleteConfirmSub')}
          confirmText={t('scenarios.delete')}
          onConfirm={() => deleteMut.mutateAsync(toDelete.id)}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
