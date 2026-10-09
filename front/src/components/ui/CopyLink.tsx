import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useToast } from './Toast';
import s from './CopyLink.module.css';

export interface CopyLinkProps {
  /** Что уходит в буфер обмена. Пустая строка — поле неактивно. */
  value: string;
  /** Что видно в поле. По умолчанию — сама ссылка без схемы. */
  text?: string;
  /** Подпись кнопки «открыть в новой вкладке»; без неё кнопки нет. */
  openLabel?: string;
  /** md — поле в окне (QR-код, приглашение), sm — строка внутри карточки. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Ссылка, которую копируют одним нажатием в любое место поля.
 *
 * Подтверждение — в самом поле, а не тостом в углу: человек смотрит туда, где
 * нажал. Адрес уезжает вверх, снизу въезжает «Скопировано», копирование в
 * плашке справа дорисовывается галочкой, по полю проходит фисташковый блик.
 * Через полторы секунды адрес возвращается — можно жать снова.
 */

// Столько держится «Скопировано»: хватает прочитать, но поле не залипает.
const HOLD_MS = 1600;

// «https://» в поле — шум: адрес читается и без схемы, а копируется всё равно целиком.
const pretty = (url: string) => url.replace(/^https?:\/\//, '');

/** navigator.clipboard есть только в защищённом контексте, а во встроенных
 *  браузерах (Instagram, Telegram) бывает запрещён — тогда старый путь через
 *  выделение скрытого поля. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const focused = document.activeElement as HTMLElement | null;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    let ok: boolean;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    focused?.focus();
    return ok;
  }
}

const SWAP = { type: 'spring', stiffness: 520, damping: 36, mass: 0.7 } as const;

export function CopyLink({ value, text, openLabel, size = 'md', className }: CopyLinkProps) {
  const { t } = useTranslation('common');
  const toast = useToast();
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  // Счётчик нажатий — ключ блика: повторное нажатие проигрывает его заново.
  const [flash, setFlash] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const urlRef = useRef<HTMLSpanElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    if (!value) return;
    const ok = await writeClipboard(value);
    window.clearTimeout(timer.current);
    if (!ok) {
      // Скопировать не дали — выделяем адрес, чтобы его можно было взять руками.
      setCopied(false);
      const node = urlRef.current;
      if (node) window.getSelection()?.selectAllChildren(node);
      toast.error(t('toasts.copyFailed'));
      return;
    }
    setCopied(true);
    setFlash(n => n + 1);
    timer.current = window.setTimeout(() => setCopied(false), HOLD_MS);
  }

  const swap = reduce ? { duration: 0 } : SWAP;
  const display = text ?? pretty(value);

  return (
    <div
      className={[s.root, s[size], className].filter(Boolean).join(' ')}
      data-copied={copied || undefined}
    >
      {flash > 0 && !reduce && <span key={flash} className={s.flash} aria-hidden />}

      <button
        type="button"
        className={s.field}
        onClick={copy}
        disabled={!value}
        aria-label={t('copyLink.copy')}
        title={value || undefined}
      >
        <span className={s.stage}>
          <AnimatePresence initial={false}>
            {copied ? (
              <motion.span
                key="done"
                className={s.done}
                initial={{ y: '115%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '-115%', opacity: 0 }}
                transition={swap}
              >
                {t('copyLink.copied')}
              </motion.span>
            ) : (
              <motion.span
                key="url"
                ref={urlRef}
                className={s.url}
                initial={{ y: '115%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '-115%', opacity: 0 }}
                transition={swap}
              >
                {display || '…'}
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <span className={s.chip} aria-hidden>
          <AnimatePresence initial={false}>
            {copied ? (
              <motion.svg
                key="check"
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={swap}
              >
                <motion.path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  initial={{ pathLength: reduce ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.34, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
                />
              </motion.svg>
            ) : (
              <motion.svg
                key="copy"
                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.4, opacity: 0, rotate: 30 }}
                transition={swap}
              >
                <rect x="9" y="9" width="12" height="12" rx="2.5" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </motion.svg>
            )}
          </AnimatePresence>
        </span>
      </button>

      {openLabel && value && (
        <a
          className={s.open}
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={openLabel}
          title={openLabel}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" /><path d="M10 14 21 3" />
          </svg>
        </a>
      )}

      {/* Экранному диктору: смена текста внутри кнопки сама не озвучивается. */}
      <span className={s.sr} role="status" aria-live="polite">{copied ? t('copyLink.copied') : ''}</span>
    </div>
  );
}
