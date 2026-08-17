import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Card } from './Card';
import { formatArg, visibleArgs } from './argFormat';

export interface ActionCardProps {
  /** Человекочитаемое описание действия (приходит с бэкенда). */
  description: string;
  /** Аргументы инструмента — показываем строками «поле: значение». */
  args?: Record<string, unknown>;
  /** Разрешённые сервером сущности: поле аргумента → имя («client_id» →
      «Анна Петрова»). Эти же поля прячутся из строк аргументов — иначе рядом
      с именем снова стоял бы голый id, который человек не проверяет. */
  entities?: Record<string, string>;
  /** Что изменится после подтверждения (формулировка из карты интерфейса). */
  effect?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  /** Уже подтверждено: карточка в истории, кнопок нет, стоит дата. */
  doneAt?: string | null;
  /** Необратимое действие (удаление): пыльная роза вместо персика на кнопке
      и в иконке — чтобы «Подтвердить» здесь не нажималось на автомате. */
  danger?: boolean;
}

// Карточка подтверждения действия ассистента (эпик AI-5, задача 10).
// Один компонент на обе поверхности чата: пузырей сообщений в проекте два
// разных (страница AI и дровер), и через месяц две копии разошлись бы в
// поведении — подтверждение из дровера вело бы себя не так, как со страницы.
export function ActionCard({
  description, args, entities, effect, onConfirm, onCancel,
  loading = false, doneAt = null, danger = false,
}: ActionCardProps) {
  const { t } = useTranslation();
  // Пароль сотрудника в карточку не выводим: она уходит в историю чата навсегда.
  // Разрешённые сервером id тоже не выводим — вместо них идут имена ниже.
  const rows = visibleArgs(args, entities, undefined);
  const named = Object.entries(entities ?? {});
  const accent = danger ? '#D88C9A' : '#F9A08B';

  return (
    <Card padding={16} style={{ marginTop: 8, opacity: doneAt ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {danger ? (
            <>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </>
          ) : (
            <>
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </>
          )}
        </svg>
        <strong style={{ fontSize: 14, color: 'var(--text, #1A1A1A)' }}>
          {doneAt ? t('ai:actions.done', { date: doneAt }) : t('ai:actions.confirmTitle')}
        </strong>
      </div>

      <div style={{ fontSize: 14, color: 'var(--text2, #666666)', lineHeight: 1.5 }}>
        {description}
      </div>

      {named.length > 0 && (
        // С кем и чем — именами, а не номерами: это единственная строка, по
        // которой человек может поймать «не та Анна» до клика.
        <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {named.map(([key, value]) => (
            <div key={key} style={{ fontSize: 13, color: 'var(--text2, #666666)' }}>
              <span style={{ opacity: 0.7 }}>{t(`ai:actions.args.${key}`, { defaultValue: key })}: </span>
              <span style={{ color: 'var(--text, #1A1A1A)', fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {effect && (
        <div style={{
          marginTop: 10, padding: '8px 10px', borderRadius: 8,
          background: danger ? 'rgba(216,140,154,0.10)' : 'rgba(249,160,139,0.08)',
          fontSize: 13, lineHeight: 1.45, color: 'var(--text2, #666666)',
        }}>
          <span style={{ opacity: 0.7 }}>{t('ai:actions.effect')}: </span>{effect}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {rows.map(([key, value]) => (
            <div key={key} style={{ fontSize: 13, color: 'var(--text2, #666666)' }}>
              <span style={{ opacity: 0.7 }}>{t(`ai:actions.args.${key}`, { defaultValue: key })}: </span>
              <span style={{ color: 'var(--text, #1A1A1A)' }}>{formatArg(key, value, t)}</span>
            </div>
          ))}
        </div>
      )}

      {!doneAt && (
        // Ряд кнопок переносится на узком экране — карточка живёт внутри ленты
        // сообщений, и на телефоне <768px кнопки не должны уезжать за край.
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          <Button variant={danger ? 'danger' : 'primary'} size="sm" loading={loading} onClick={onConfirm}>
            {t('ai:actions.confirm')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            {t('ai:actions.cancel')}
          </Button>
        </div>
      )}
    </Card>
  );
}
