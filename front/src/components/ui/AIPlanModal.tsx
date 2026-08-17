import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Segmented, Input } from './modal';
import { Select } from './Select';
import { Switch } from './Switch';
import { usePlanSources, type PlanOption } from './planSources';
import { formatArg, visibleArgs } from './argFormat';
import type { AIPlanField, AIPlanProposal, AIPlanStep } from '../../api/ai/ai.types';

export type PlanAnswers = Record<string, Record<string, unknown>>;

export interface AIPlanModalProps {
  plan: AIPlanProposal;
  onConfirm: (answers: PlanAnswers) => void;
  onClose: () => void;
  loading?: boolean;
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Три шага, всегда три. Пустой шаг не выбрасывается: человек, который однажды
// увидел здесь три экрана, во второй раз ищет своё поле на том же месте, а
// исчезающая нумерация («шаг 2 из 3» вчера, «из 2» сегодня) читается как сбой.
// Цену этого решения гасит кнопка подтверждения: она доступна с ЛЮБОГО шага,
// как только заполнять нечего, — простое действие остаётся одним касанием.
const PAGES = [
  // Кто и что: сущности — люди, услуги, залы.
  { key: 'who', match: (f: AIPlanField) => Boolean(f.source) || f.control === 'password' },
  // Когда: даты, дни недели, часы.
  { key: 'when', match: (f: AIPlanField) => f.control === 'date' || f.control === 'datetime'
      || f.control === 'list' || /time|day|date|break/.test(f.name) },
  // Проверьте: всё остальное плюс сводка плана.
  { key: 'check', match: () => true },
] as const;

function pageOf(field: AIPlanField): number {
  const index = PAGES.findIndex((p) => p.match(field));
  return index < 0 ? 2 : index;
}

/** Подпись поля: описание из схемы, иначе тот же ключ локали, что и в карточке. */
function labelOf(field: AIPlanField, t: TFunction): string {
  return field.hint || t(`ai:actions.args.${field.name}`, { defaultValue: field.name });
}

// Подпись поля тем же начертанием, что у Input кита: Select и капсулы дней
// своей label не имеют, а разнобой в подписях внутри одного окна заметен сразу.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text3)',
      letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 7,
    }}>{children}</label>
  );
}

function FieldControl({ field, value, options, onChange, t }: {
  field: AIPlanField; value: unknown; options: PlanOption[];
  onChange: (v: unknown) => void; t: TFunction;
}) {
  const label = labelOf(field, t);

  if (field.control === 'select') {
    return (
      <div>
        <FieldLabel>{label}</FieldLabel>
        <Select
          value={value == null ? '' : String(value)}
          options={options}
          onChange={(v) => onChange(Number(v))}
          placeholder={t('ai:plan.choose')}
          searchable={options.length > 8}
          emptyText={t('ai:plan.nothingFound')}
        />
      </div>
    );
  }
  if (field.control === 'segmented' && field.options) {
    return (
      <Segmented
        label={label}
        value={String(value ?? field.options[0])}
        options={field.options.map((o) => ({
          value: o, label: t(`ai:plan.values.${o}`, { defaultValue: o }),
        }))}
        onChange={onChange}
      />
    );
  }
  if (field.control === 'switch') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 14, color: 'var(--text2, #666666)' }}>{label}</span>
        <Switch checked={Boolean(value)} onChange={onChange} />
      </div>
    );
  }
  if (field.control === 'list' && field.name === 'weekdays') {
    // Дни недели — не текстовое поле со списком чисел: «0,1» человек не
    // напишет и не проверит. Семь переключаемых капсул.
    const picked = new Set((Array.isArray(value) ? value : []).map(Number));
    return (
      <div>
        <FieldLabel>{label}</FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DAY_KEYS.map((day, index) => {
            const on = picked.has(index);
            return (
              <button
                key={day} type="button" aria-pressed={on}
                onClick={() => {
                  const next = new Set(picked);
                  if (on) next.delete(index); else next.add(index);
                  onChange([...next].sort((a, b) => a - b));
                }}
                style={{
                  padding: '7px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 13,
                  border: `1.5px solid ${on ? '#F9A08B' : 'var(--border2, #EEEBE6)'}`,
                  background: on ? 'rgba(249,160,139,0.12)' : 'transparent',
                  color: on ? '#1A1A1A' : 'var(--text2, #666666)',
                  fontWeight: on ? 600 : 500,
                }}
              >
                {t(`common:days.short.${day}`)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const type = field.control === 'date' ? 'date'
    : field.control === 'datetime' ? 'datetime-local'
    : field.control === 'number' ? 'number'
    // Пароль сотрудника: владелец задаёт его тут и передаёт человеку лично.
    // В план и в подпись он не уезжает — идёт прямо в исполнение.
    : field.control === 'password' ? 'password' : 'text';
  return (
    <Input
      label={label}
      type={type}
      value={value == null ? '' : String(value)}
      onChange={(v) => onChange(type === 'number' ? Number(v) : v)}
    />
  );
}

function StepSummary({ step, t }: { step: AIPlanStep; t: TFunction }) {
  const named = Object.entries(step.entities ?? {});
  const refs = Object.entries(step.refs ?? {});
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 10, background: 'var(--bg2, #FAF8F5)',
      borderLeft: `3px solid ${step.danger ? '#D88C9A' : '#F9A08B'}`,
    }}>
      <div style={{ fontSize: 13, color: 'var(--text, #1A1A1A)', fontWeight: 600 }}>
        {step.n}. {step.description}
      </div>
      {named.map(([key, value]) => (
        <div key={key} style={{ fontSize: 12, color: 'var(--text2, #666666)', marginTop: 3 }}>
          {t(`ai:actions.args.${key}`, { defaultValue: key })}: {value}
        </div>
      ))}
      {refs.map(([key, from]) => (
        <div key={key} style={{ fontSize: 12, color: 'var(--text2, #666666)', marginTop: 3 }}>
          {t(`ai:actions.args.${key}`, { defaultValue: key })}: {t('ai:plan.fromStep', { n: from })}
        </div>
      ))}
      {/* Остальные поля действия: ставка, дни, часы, число мест. Без них окно
          показывало меньше, чем показывала карточка подтверждения до него. */}
      {visibleArgs(step.args, step.entities, step.refs).map(([key, value]) => (
        <div key={key} style={{ fontSize: 12, color: 'var(--text2, #666666)', marginTop: 3 }}>
          {t(`ai:actions.args.${key}`, { defaultValue: key })}: {formatArg(key, value, t)}
        </div>
      ))}
      {step.effect && (
        <div style={{ fontSize: 12, color: 'var(--text2, #666666)', marginTop: 6, opacity: 0.85 }}>
          {step.effect}
        </div>
      )}
    </div>
  );
}

// Окно плана ассистента (часть A). Заменяет карточку подтверждения на всех
// изменяющих действиях: одно действие или двенадцать — человек видит одно и то
// же окно, отличается только длина списка на третьем шаге.
export function AIPlanModal({ plan, onConfirm, onClose, loading = false }: AIPlanModalProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState<PlanAnswers>({});

  const allFields = useMemo(
    () => plan.steps.flatMap((s) => s.missing.map((f) => ({ step: s, field: f }))),
    [plan.steps],
  );
  const sources = usePlanSources(allFields.map((x) => x.field));

  const valueOf = (step: AIPlanStep, field: AIPlanField) =>
    answers[String(step.n)]?.[field.name] ?? step.args[field.name];

  const setValue = (step: AIPlanStep, field: AIPlanField, value: unknown) =>
    setAnswers((prev) => ({
      ...prev,
      [String(step.n)]: { ...(prev[String(step.n)] ?? {}), [field.name]: value },
    }));

  // Незаполненное по ВСЕМУ плану, а не по текущему экрану: кнопка обязана
  // блокироваться из-за поля на любом шаге, иначе человек жмёт «Создать» и
  // получает отказ сервера про поле, которого не видел.
  const stillEmpty = allFields.filter(({ step, field }) => {
    const value = valueOf(step, field);
    return value === undefined || value === null || value === ''
      || (Array.isArray(value) && value.length === 0);
  });
  const canConfirm = stillEmpty.length === 0;

  const onPage = allFields.filter(({ field }) => pageOf(field) === page);
  const danger = plan.steps.some((s) => s.danger);

  return (
    <ModalShell onClose={onClose} size="sm" maxWidth="560px">
      <ModalHeader
        title={t(`ai:plan.pages.${PAGES[page].key}`)}
        subtitle={t('ai:plan.stepOf', { current: page + 1, total: PAGES.length })}
      />
      <ModalBody>
        {onPage.map(({ step, field }) => (
          <FieldControl
            key={`${step.n}.${field.name}`}
            field={field}
            value={valueOf(step, field)}
            options={(sources[field.source ?? 'lessons'] as PlanOption[]) ?? []}
            onChange={(v) => setValue(step, field, v)}
            t={t}
          />
        ))}

        {onPage.length === 0 && page < 2 && (
          <div style={{ fontSize: 13, color: 'var(--text2, #666666)' }}>
            {t('ai:plan.nothingToFill')}
          </div>
        )}

        {page === 2 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {plan.steps.map((step) => <StepSummary key={step.n} step={step} t={t} />)}
          </div>
        )}

        {plan.warnings.map((w, i) => (
          <div key={i} style={{
            padding: '9px 11px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.45,
            background: 'rgba(249,160,139,0.10)', color: 'var(--text2, #666666)',
          }}>
            {w.text}
          </div>
        ))}
      </ModalBody>
      <ModalFooter>
        <GhostButton onClick={page > 0 ? () => setPage(page - 1) : undefined}>
          {page > 0 ? t('ai:plan.back') : t('ai:actions.cancel')}
        </GhostButton>
        {page < PAGES.length - 1 && (
          <GhostButton onClick={() => setPage(page + 1)}>{t('ai:plan.next')}</GhostButton>
        )}
        {/* Доступна с ЛЮБОГО шага, как только заполнять нечего: «заморозь
            Анну» обязано стоить одно касание, а не три. */}
        <PrimaryButton
          onClick={() => onConfirm(answers)}
          disabled={!canConfirm}
          loading={loading}
        >
          {danger ? t('ai:plan.confirmDanger') : t('ai:plan.confirm')}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
