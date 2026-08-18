import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card } from './Card';
import { Button } from './Button';
import { Segmented, Input } from './modal';
import { Select } from './Select';
import { Switch } from './Switch';
import { usePlanSources, type PlanOption } from './planSources';
import { formatArg, visibleArgs } from './argFormat';
import type { AIPlanField, AIPlanProposal, AIPlanStep } from '../../api/ai/ai.types';

export type PlanAnswers = Record<string, Record<string, unknown>>;

export interface AIPlanCardProps {
  plan: AIPlanProposal;
  onConfirm: (answers: PlanAnswers) => void;
  onCancel: () => void;
  loading?: boolean;
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ACCENT = '#F9A08B';
const DANGER = '#D88C9A';

// Три шага, всегда три. Пустой шаг не выбрасывается: человек, который однажды
// увидел здесь три экрана, во второй раз ищет своё поле на том же месте, а
// исчезающая нумерация («шаг 2 из 3» вчера, «из 2» сегодня) читается как сбой.
const PAGES = [
  { key: 'who', match: (f: AIPlanField) => Boolean(f.source) || f.control === 'password' },
  { key: 'when', match: (f: AIPlanField) => f.control === 'date' || f.control === 'datetime'
      || f.control === 'list' || /time|day|date|break/.test(f.name) },
  { key: 'check', match: () => true },
] as const;

const pageOf = (field: AIPlanField) => {
  const i = PAGES.findIndex((p) => p.match(field));
  return i < 0 ? 2 : i;
};

const labelOf = (field: AIPlanField, t: TFunction) =>
  field.hint || t(`ai:actions.args.${field.name}`, { defaultValue: field.name });

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
                  border: `1.5px solid ${on ? ACCENT : 'var(--border2, #EEEBE6)'}`,
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
    <Input label={label} type={type}
      value={value == null ? '' : String(value)}
      onChange={(v) => onChange(type === 'number' ? Number(v) : v)} />
  );
}

interface PlanGroup {
  title: string;
  steps: AIPlanStep[];
  common: [string, string][];      // подпись → значение, одинаковые у всей группы
  distinct: { n: number; text: string }[];
  effect?: string | null;
  danger: boolean;
}

/** Свернуть подряд идущие одинаковые действия в одну группу.
 *
 * Четыре «Завести сотрудника» с одинаковой ставкой, должностью и ролью — это
 * четыре одинаковых блока по шесть строк, где меняется ровно имя. Такое не
 * читают, а пролистывают — и подтверждают, не проверив. Показываем общее один
 * раз, а по шагам — только то, чем они отличаются. */
function groupSteps(steps: AIPlanStep[], t: TFunction): PlanGroup[] {
  const groups: PlanGroup[] = [];
  for (const step of steps) {
    const last = groups[groups.length - 1];
    if (last && last.title === step.title && last.steps[0].tool === step.tool) last.steps.push(step);
    else groups.push({ title: step.title, steps: [step], common: [], distinct: [], danger: false });
  }

  for (const group of groups) {
    const cells = group.steps.map((step) => {
      const row = new Map<string, string>();
      for (const [key, value] of Object.entries(step.entities ?? {})) row.set(key, value);
      for (const [key, from] of Object.entries(step.refs ?? {})) {
        row.set(key, t('ai:plan.fromStep', { n: from }));
      }
      for (const [key, value] of visibleArgs(step.args, step.entities, step.refs)) {
        row.set(key, formatArg(key, value, t));
      }
      return row;
    });

    const keys = [...new Set(cells.flatMap((row) => [...row.keys()]))];
    const shared = keys.filter((key) =>
      cells.every((row) => row.get(key) !== undefined && row.get(key) === cells[0].get(key)));

    group.common = shared.map((key) =>
      [t(`ai:actions.args.${key}`, { defaultValue: key }), cells[0].get(key) as string]);
    group.distinct = group.steps.map((step, i) => ({
      n: step.n,
      text: keys.filter((k) => !shared.includes(k))
        .map((k) => cells[i].get(k)).filter(Boolean).join(' · '),
    }));
    group.effect = group.steps[0].effect;
    group.danger = group.steps.some((s) => s.danger);
  }
  return groups;
}

function GroupBlock({ group }: { group: PlanGroup }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 10, background: 'var(--bg2, #FAF8F5)',
      borderLeft: `3px solid ${group.danger ? DANGER : ACCENT}`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #1A1A1A)' }}>
        {group.title}
        {group.steps.length > 1 && (
          <span style={{ marginLeft: 6, opacity: 0.55, fontWeight: 600 }}>× {group.steps.length}</span>
        )}
      </div>

      {group.distinct.some((d) => d.text) && (
        <div style={{ marginTop: 5, display: 'grid', gap: 2 }}>
          {group.distinct.map((d) => (
            <div key={d.n} style={{ fontSize: 12.5, color: 'var(--text, #1A1A1A)' }}>
              <span style={{ opacity: 0.45 }}>{d.n}.</span> {d.text}
            </div>
          ))}
        </div>
      )}

      {group.common.length > 0 && (
        <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text2, #666666)' }}>
          {group.common.map(([label, value]) => `${label}: ${value}`).join(' · ')}
        </div>
      )}

      {group.effect && (
        // Последствие — ОДИН раз на группу: четыре одинаковых абзаца про
        // приглашение на 7 дней человек перестаёт читать после первого.
        <div style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.4,
                      color: 'var(--text2, #666666)', opacity: 0.8 }}>
          {group.effect}
        </div>
      )}
    </div>
  );
}

// Карточка подтверждения плана — ВНУТРИ ленты чата, а не модалкой поверх неё:
// человек читает её там же, где читает ответ, и не теряет контекст разговора.
export function AIPlanCard({ plan, onConfirm, onCancel, loading = false }: AIPlanCardProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState<PlanAnswers>({});

  const allFields = useMemo(
    () => plan.steps.flatMap((s) => s.missing.map((f) => ({ step: s, field: f }))),
    [plan.steps],
  );
  const groups = useMemo(() => groupSteps(plan.steps, t), [plan.steps, t]);
  const sources = usePlanSources(allFields.map((x) => x.field));

  const valueOf = (step: AIPlanStep, field: AIPlanField) =>
    answers[String(step.n)]?.[field.name] ?? step.args[field.name];

  const setValue = (step: AIPlanStep, field: AIPlanField, value: unknown) =>
    setAnswers((prev) => ({
      ...prev,
      [String(step.n)]: { ...(prev[String(step.n)] ?? {}), [field.name]: value },
    }));

  // Незаполненное по ВСЕМУ плану, а не по текущему экрану: кнопка обязана
  // оставаться серой из-за поля на любом шаге, иначе человек жмёт «Утверждаю»
  // и получает отказ сервера про поле, которого не видел.
  const empty = allFields.filter(({ step, field }) => {
    const v = valueOf(step, field);
    return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  });
  const onPage = allFields.filter(({ field }) => pageOf(field) === page);
  const last = page === PAGES.length - 1;

  // Одинаковые предупреждения схлопываем: три строки «в карточке тренера нет
  // рабочих дней» подряд — это шум, а не три разных факта.
  const warnings = [...new Set(plan.warnings.map((w) => w.text))];

  return (
    <Card padding={16} style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontSize: 14, color: 'var(--text, #1A1A1A)' }}>
          {t('ai:plan.title', { count: plan.steps.length })}
        </strong>
        <div style={{ display: 'flex', gap: 4 }} aria-hidden="true">
          {PAGES.map((p, i) => (
            <span key={p.key} style={{
              width: i === page ? 18 : 6, height: 6, borderRadius: 3,
              background: i === page ? ACCENT : 'var(--border2, #EEEBE6)',
              transition: 'width .18s ease',
            }} />
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2, #666666)', marginTop: 2 }}>
        {t(`ai:plan.pages.${PAGES[page].key}`)}
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
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
        {onPage.length === 0 && !last && (
          <div style={{ fontSize: 13, color: 'var(--text2, #666666)' }}>{t('ai:plan.nothingToFill')}</div>
        )}
        {last && groups.map((group, i) => <GroupBlock key={i} group={group} />)}
        {warnings.map((text, i) => (
          <div key={i} style={{
            padding: '9px 11px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.45,
            background: 'rgba(249,160,139,0.10)', color: 'var(--text2, #666666)',
          }}>{text}</div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'center' }}>
        <Button variant="ghost" size="sm" disabled={loading}
                onClick={page > 0 ? () => setPage(page - 1) : onCancel}>
          {page > 0 ? t('ai:plan.back') : t('ai:actions.cancel')}
        </Button>
        {!last && (
          <Button variant="ghost" size="sm" onClick={() => setPage(page + 1)}>{t('ai:plan.next')}</Button>
        )}
        {/* Кнопка стоит на последнем шаге и до заполнения серая: пока чего-то
            не хватает, нажимать нечего — сервер всё равно откажет. */}
        {last && (
          <Button variant={groups.some((g) => g.danger) ? 'danger' : 'primary'} size="sm"
                  loading={loading} disabled={empty.length > 0}
                  onClick={() => onConfirm(answers)}>
            {t('ai:plan.confirm')}
          </Button>
        )}
        {last && empty.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text2, #666666)' }}>
            {t('ai:plan.stillEmpty', { count: empty.length })}
          </span>
        )}
      </div>
    </Card>
  );
}
