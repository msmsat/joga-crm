import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion';
import styles from './aiQuick.module.css';
import { useAssistant } from '../../../hooks/useAssistant';
import type { AIChatMessage } from '../../../api/ai/ai.types';
import { Button } from '../Button';
import { QuickComposer } from './QuickComposer';
import { QuickExchange, QuickSuggestions } from './QuickExchange';
import { ChatIcon, CloseIcon, VeloraOrb } from './QuickParts';

// ─── БЫСТРЫЙ ВОПРОС АССИСТЕНТУ (телефон) ─────────────────────────────────────
// Кнопка «✦ AI» на телефоне раньше открывала чат на весь экран — ради вопроса
// «что у нас сегодня?» человек уходил со страницы. Теперь из кнопки свисает
// окно: спросил, прочитал ответ, закрыл — и остался там, где был. Весь
// разговор — «Перейти в чат»: это та же сессия панели (поверхность 'drawer'),
// вопрос и ответ уже будут там, план действий — тоже (он в общем кэше).
//
// Компонент смонтирован ВСЕГДА (его держит Navbar), открыто только окно
// внутри. Иначе закрытие окна размонтировало бы useAssistant, а он на выходе
// обрывает стрим — ответ, который ещё пишется, пропал бы вместе с окном.

export interface AIQuickPanelProps {
  /** Центр кнопки «AI» по горизонтали, px от левого края; null — окно закрыто. */
  anchorX: number | null;
  onClose: () => void;
  /** Закрыть окно и открыть панель чата с тем же диалогом. */
  onOpenChat: () => void;
}

type Exchange = { answer?: AIChatMessage; found: boolean };

// Ответ на вопрос из окна — по самой ленте, а не по счётчику сообщений: пока
// сессия создаётся, лента переезжает с ключа «сессии нет» на настоящий, а на
// запасном пути (без стрима) оптимистичные записи заменяются сохранёнными.
function exchangeOf(messages: AIChatMessage[], question: string | null): Exchange {
  if (question == null) return { found: false };
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && messages[i].text === question) {
      return { found: true, answer: messages.slice(i + 1).find((m) => m.role === 'assistant') };
    }
  }
  return { found: false };
}

export function AIQuickPanel({ anchorX, onClose, onOpenChat }: AIQuickPanelProps) {
  const { messages, isThinking, toolStatus, planProposal, sendMessage } = useAssistant();
  const [question, setQuestion] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // Смахнули вверх — окно уезжает дальше вверх, а не возвращается на место,
  // чтобы раствориться (см. variants ниже и custom у AnimatePresence).
  const [flung, setFlung] = useState(false);

  const { found, answer } = exchangeOf(messages, question);
  // Вопрос из окна виден, пока он есть в ленте открытого диалога. Начали в
  // панели «Новый чат» — старого вопроса там нет, окно снова пустое.
  const shown = question != null && (found || isThinking) ? question : null;
  const planReady = shown != null && !!planProposal && !isThinking;

  const ask = (text: string) => {
    const q = text.trim();
    if (!q || isThinking) return;
    setQuestion(q);
    setDraft('');
    // Клавиатура уходит: ответ читают, а не печатают под ним дальше.
    (document.activeElement as HTMLElement | null)?.blur();
    void sendMessage(q);
  };

  const close = (viaFling = false) => {
    setFlung(viaFling);
    onClose();
  };

  return createPortal(
    <AnimatePresence custom={flung}>
      {anchorX != null && (
        <QuickSheet
          key="ai-quick"
          anchorX={anchorX}
          flung={flung}
          onClose={close}
          onOpenChat={onOpenChat}
          draft={draft}
          onDraft={setDraft}
          onAsk={ask}
          busy={isThinking}
          // Пустое окно — это подсказки: клавиатуру поднимаем сразу. Окно с
          // ответом открывают, чтобы дочитать, — клавиатура закрыла бы его половину.
          focusOnOpen={shown == null && !isThinking}
          planReady={planReady}
        >
          {shown != null ? (
            <QuickExchange
              question={shown}
              answer={answer?.text ?? ''}
              streaming={!!answer && answer.id < 0}
              thinking={isThinking}
              toolStatus={toolStatus}
              planReady={planReady}
              onRetry={() => ask(shown)}
            />
          ) : (
            <QuickSuggestions onPick={ask} />
          )}
        </QuickSheet>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Само окно ───────────────────────────────────────────────────────────────

// Нижний край видимой области. На телефоне с открытой клавиатурой это не низ
// экрана: окно, рассчитанное на 100dvh, уходило бы подвалом под клавиатуру.
function subscribeViewport(cb: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener('resize', cb);
  vv?.addEventListener('scroll', cb);
  return () => {
    vv?.removeEventListener('resize', cb);
    vv?.removeEventListener('scroll', cb);
  };
}
function visibleBottom() {
  const vv = window.visualViewport;
  return vv ? Math.round(vv.offsetTop + vv.height) : window.innerHeight;
}

const GUTTER = 10;   // поле окна от края экрана — то же, что в .panel
const FLING_OFFSET = -56;
const FLING_VELOCITY = -450;

const sheetVariants = {
  hidden: { opacity: 0, y: -12, scale: 0.94 },
  shown: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 520, damping: 36, mass: 0.9 },
  },
  // Обычное закрытие — окно втягивается обратно в кнопку; смахнутое — уезжает
  // вверх по ходу жеста.
  exit: (flung: boolean) => (flung
    ? { opacity: 0, y: -220, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] as const } }
    : { opacity: 0, y: -10, scale: 0.95, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as const } }),
};

interface QuickSheetProps {
  anchorX: number;
  flung: boolean;
  onClose: (viaFling?: boolean) => void;
  onOpenChat: () => void;
  draft: string;
  onDraft: (value: string) => void;
  onAsk: (text: string) => void;
  busy: boolean;
  focusOnOpen: boolean;
  /** План ждёт подтверждения — «Перейти в чат» становится главной кнопкой. */
  planReady: boolean;
  children: React.ReactNode;
}

function QuickSheet({
  anchorX, flung, onClose, onOpenChat, draft, onDraft, onAsk, busy, focusOnOpen, planReady, children,
}: QuickSheetProps) {
  const { t } = useTranslation('ai');
  const drag = useDragControls();
  const bodyRef = useRef<HTMLDivElement>(null);
  const bottom = useSyncExternalStore(subscribeViewport, visibleBottom);
  const [width] = useState(() => window.innerWidth);

  // Хвостик — ровно под кнопкой, но не ближе 28px к скруглённому углу.
  const notchX = Math.min(Math.max(anchorX - GUTTER, 28), width - GUTTER * 2 - 28);

  // Esc с внешней клавиатуры и поворот в планшетную ширину закрывают окно:
  // на ≥768px его прячет CSS, а открытым-невидимым оно держало бы затемнение
  // в стейте и активную кнопку «AI».
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const wide = window.matchMedia('(min-width: 768px)');
    const onWide = () => { if (wide.matches) onClose(); };
    window.addEventListener('keydown', onKey);
    wide.addEventListener('change', onWide);
    return () => {
      window.removeEventListener('keydown', onKey);
      wide.removeEventListener('change', onWide);
    };
  }, [onClose]);

  // Ответ печатается — лента едет за ним, но только если человек сам не
  // отмотал её выше, чтобы перечитать начало.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const observer = new MutationObserver(() => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 64) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  // Тянуть можно за шапку и за ручку внизу, но не за кнопку в шапке.
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.start(e);
  };
  const onDragEnd = (_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    if (info.offset.y < FLING_OFFSET || info.velocity.y < FLING_VELOCITY) onClose(true);
  };

  return (
    <>
      <motion.div
        className={styles.scrim}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.2 } }}
        exit={{ opacity: 0, transition: { duration: 0.18 } }}
        onClick={() => onClose()}
      />
      <motion.div
        className={styles.panel}
        role="dialog"
        aria-label="Velora AI"
        custom={flung}
        variants={sheetVariants}
        initial="hidden"
        animate="shown"
        exit="exit"
        drag="y"
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.75, bottom: 0.05 }}
        onDragEnd={onDragEnd}
        style={{
          '--aiq-notch-x': `${notchX}px`,
          transformOrigin: `${notchX}px 0px`,
          // Подвал с «Перейти в чат» — над клавиатурой; без неё снизу остаётся
          // полоса затемнения: окно читается как окно, а не как новая страница.
          maxHeight: `min(calc(${bottom}px - var(--topbar-h, 56px) - 22px), calc(100dvh - var(--topbar-h, 56px) - 96px))`,
        } as React.CSSProperties}
      >
        <span className={styles.notch} />

        <header className={styles.head} onPointerDown={startDrag}>
          <VeloraOrb busy={busy} />
          <div className={styles.headText}>
            <div className={styles.title}>Velora AI</div>
            <div className={styles.subtitle}>{t('quick.idle')}</div>
          </div>
          <button type="button" className={styles.close} onClick={() => onClose()} aria-label={t('common:buttons.close')}>
            <CloseIcon />
          </button>
        </header>

        <QuickComposer
          value={draft}
          onChange={onDraft}
          onSend={() => onAsk(draft)}
          busy={busy}
          focusOnMount={focusOnOpen}
        />

        <div ref={bodyRef} className={styles.body}>{children}</div>

        <div className={styles.foot}>
          <Button
            variant={planReady ? 'primary' : 'dark'}
            fullWidth
            icon={<ChatIcon />}
            onClick={onOpenChat}
            style={{ padding: '13px 18px', borderRadius: '14px' }}
          >
            {t('quick.goToChat')}
          </Button>
        </div>
        <div className={styles.grip} onPointerDown={startDrag} aria-hidden="true"><span /></div>
      </motion.div>
    </>
  );
}
