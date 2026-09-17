import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { ModalShell, ModalHeader, ModalBody, ModalFooter } from './modal';
import { Button } from './Button';
import { useToast } from './Toast';

/**
 * Одна модалка на все QR продукта: мини-приложение студии, занятие, абонемент.
 *
 * Отличаются они только тем, ЧТО закодировано и что написано на плакате, —
 * поэтому копирование, печать и картинка для сторис живут здесь в одном
 * экземпляре, а страницы передают текст. Три копии этого кода разъехались бы
 * на первой же правке плаката.
 *
 * Картинка для сторис — главное, ради чего это заводилось: студия выкладывает
 * код в Instagram, а не вешает на стойку. Формат 1080×1920 — ровно холст
 * сторис, чтобы его не пришлось кадрировать в редакторе телефона.
 */

/** Схему в подписи не показываем: «api.velora.app/s/k3m9x2ptqv» читается, «https://…» — шум. */
const pretty = (url: string) => url.replace(/^https?:\/\//, '');

const esc = (s: string) =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export interface QrShareModalProps {
  /** Что закодировано. Пустая строка — модалку открывать незачем. */
  url: string;
  /** Крупная строка плаката: название занятия, абонемента или студии. */
  title: string;
  /** Под заголовком: дата и время занятия, состав абонемента. */
  subtitle?: string;
  /** Надстрочник — как правило, название студии. */
  kicker?: string;
  /** Строка под кодом: «Наведите камеру, чтобы записаться». */
  caption?: string;
  /** Имя файла картинки для сторис, без расширения. */
  fileName?: string;
  onClose: () => void;
}

// ── Плакат для сторис ──────────────────────────────────────────────────────
const STORY_W = 1080;
const STORY_H = 1920;
const STORY_PAD = 96;

/** Разбивает строку по ширине. Слово длиннее строки не режем — перенос внутри
 *  слова на плакате выглядит как опечатка, лучше пусть выйдет за меру.
 *  Что не поместилось в отведённые строки, заканчивается многоточием: обрыв на
 *  полуслове читается как поломка, а не как длинное название. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  let cut = false;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) { cut = true; break; }
    } else {
      line = candidate;
    }
  }
  if (cut) lines[lines.length - 1] += '…';
  else if (line) lines.push(line);
  return lines.length ? lines : [text];
}

interface StoryText { kicker?: string; title: string; subtitle?: string; caption?: string; url: string }

/** Рисует плакат 1080×1920 и отдаёт его картинкой. Источник кода — уже
 *  отрисованный на странице canvas: перерисовывать QR второй библиотекой
 *  значило бы держать две реализации одного кода. */
async function drawStory(qr: HTMLCanvasElement, text: StoryText): Promise<Blob | null> {
  // Шрифт обязан быть загружен ДО измерений: пока Manrope не готов, canvas
  // мерит системным, и перенос строк рассчитывается не по тому кеглю.
  await document.fonts?.ready;

  const canvas = document.createElement('canvas');
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const bg = ctx.createLinearGradient(0, 0, 0, STORY_H);
  bg.addColorStop(0, '#FDFCFB');
  bg.addColorStop(1, '#F6EAE3');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  // Персиковое свечение сверху — тот же приём, что у карточек кабинета.
  const glow = ctx.createRadialGradient(STORY_W / 2, 260, 0, STORY_W / 2, 260, 760);
  glow.addColorStop(0, 'rgba(252,174,145,0.42)');
  glow.addColorStop(1, 'rgba(252,174,145,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, STORY_W, 1100);

  const width = STORY_W - STORY_PAD * 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.font = '800 72px Manrope, Inter, sans-serif';
  const titleLines = wrap(ctx, text.title, width, 3);
  ctx.font = '600 38px Manrope, Inter, sans-serif';
  const subLines = text.subtitle ? wrap(ctx, text.subtitle, width, 2) : [];

  const tile = 760;
  const block =
    (text.kicker ? 34 + 34 : 0) +
    titleLines.length * 86 +
    (subLines.length ? 20 + subLines.length * 52 : 0) +
    72 + tile +
    (text.caption ? 56 + 44 : 0) +
    28 + 34;
  let y = Math.max(STORY_PAD, (STORY_H - block) / 2);

  if (text.kicker) {
    ctx.font = '800 26px Manrope, Inter, sans-serif';
    ctx.fillStyle = '#B09C92';
    // letterSpacing поддержан не везде; там, где нет, надстрочник просто
    // нарисуется без разрядки — плакат от этого не ломается.
    ctx.letterSpacing = '6px';
    ctx.fillText(text.kicker.toUpperCase(), STORY_W / 2, y);
    ctx.letterSpacing = '0px';
    y += 34 + 34;
  }

  ctx.font = '800 72px Manrope, Inter, sans-serif';
  ctx.fillStyle = '#1A1A1A';
  for (const line of titleLines) {
    ctx.fillText(line, STORY_W / 2, y);
    y += 86;
  }

  if (subLines.length) {
    y += 20;
    ctx.font = '600 38px Manrope, Inter, sans-serif';
    ctx.fillStyle = '#7A6E68';
    for (const line of subLines) {
      ctx.fillText(line, STORY_W / 2, y);
      y += 52;
    }
  }

  y += 72;
  const tileX = (STORY_W - tile) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(26,26,26,0.14)';
  ctx.shadowBlur = 64;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(tileX, y, tile, tile, 64);
  ctx.fill();
  ctx.restore();
  // Сглаживание выключено намеренно: размытые модули кода камера читает хуже.
  ctx.imageSmoothingEnabled = false;
  const code = tile - 128;
  ctx.drawImage(qr, tileX + 64, y + 64, code, code);
  ctx.imageSmoothingEnabled = true;
  y += tile;

  if (text.caption) {
    y += 56;
    ctx.font = '700 36px Manrope, Inter, sans-serif';
    ctx.fillStyle = '#1A1A1A';
    ctx.fillText(wrap(ctx, text.caption, width, 1)[0], STORY_W / 2, y);
    y += 44;
  }

  y += 28;
  ctx.font = '600 28px ui-monospace, Menlo, monospace';
  ctx.fillStyle = '#A8988F';
  ctx.fillText(pretty(text.url), STORY_W / 2, y);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// ── Компонент ──────────────────────────────────────────────────────────────
export function QrShareModal({ url, title, subtitle, kicker, caption, fileName, onClose }: QrShareModalProps) {
  const { t } = useTranslation('common');
  const toast = useToast();
  const svgRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const shareTitle = caption ?? t('qr.scanHint');

  function copy() {
    navigator.clipboard.writeText(url).then(
      () => toast.success(t('qr.copied')),
      () => toast.error(t('qr.copyFailed')),
    );
  }

  function print() {
    // Печатаем ровно тот <svg>, что на экране: у него есть viewBox, поэтому на
    // листе он тянется до 300px без потери чёткости.
    const svg = svgRef.current?.querySelector('svg')?.outerHTML;
    if (!svg) return;
    // Отдельное окно, а не @media print по дашборду: лист собирается сам по
    // себе, без войны с вёрсткой кабинета.
    const sheet = window.open('', '_blank', 'width=760,height=980');
    if (!sheet) { toast.error(t('qr.printBlocked')); return; }
    sheet.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 0 }
  * { margin: 0; padding: 0; box-sizing: border-box }
  body { font-family: Manrope, Inter, system-ui, sans-serif; color: #1A1A1A; background: #fff;
         min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 48px }
  .sheet { text-align: center; max-width: 560px }
  .kicker { font-size: 14px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase;
            color: #9A9A9A; margin-bottom: 12px }
  h1 { font-size: 38px; line-height: 1.15; font-weight: 800; letter-spacing: -0.02em }
  .sub { margin-top: 12px; font-size: 18px; font-weight: 600; color: #7A6E68 }
  .qr { display: inline-block; margin-top: 32px; padding: 26px; border-radius: 28px;
        border: 1.5px solid #EEEBE6; box-shadow: 0 18px 48px rgba(0,0,0,.07) }
  .qr svg { display: block; width: 300px; height: 300px }
  .hint { margin-top: 28px; font-size: 17px; color: #666 }
  .url { margin-top: 10px; font-size: 15px; font-family: ui-monospace, Menlo, monospace; color: #1A1A1A }
  @media print { body { padding: 0 } .qr { box-shadow: none } }
</style></head>
<body onload="print()" onafterprint="close()">
  <div class="sheet">
    ${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ''}
    <h1>${esc(title)}</h1>
    ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
    <div class="qr">${svg}</div>
    <div class="hint">${esc(shareTitle)}</div>
    <div class="url">${esc(pretty(url))}</div>
  </div>
</body></html>`);
    sheet.document.close();
  }

  async function story() {
    const qr = canvasRef.current?.querySelector('canvas');
    if (!qr || busy) return;
    setBusy(true);
    try {
      const blob = await drawStory(qr, { kicker, title, subtitle, caption: shareTitle, url });
      if (!blob) { toast.error(t('qr.storyFailed')); return; }
      const name = `${(fileName || title).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'qr'}-story.png`;
      const file = new File([blob], name, { type: 'image/png' });
      // На телефоне «Поделиться» отдаёт картинку прямо в Instagram — ради этого
      // всё и затевалось. На десктопе такого приёмника нет, там остаётся файл.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return;
      }
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = name;
      link.click();
      URL.revokeObjectURL(href);
      toast.success(t('qr.storySaved'));
    } catch (error) {
      // Отмена системного диалога «Поделиться» — не ошибка, ругаться не на что.
      if ((error as DOMException)?.name !== 'AbortError') toast.error(t('qr.storyFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    // 9999 — как у ConfirmModal: код открывают и поверх попапа журнала,
    // который сам стоит на 9000 и иначе накрыл бы модалку собой.
    <ModalShell onClose={onClose} maxWidth="420px" zIndex={9999}>
      <ModalHeader title={t('qr.title')} subtitle={t('qr.subtitle')} />

      <ModalBody>
        {/* Превью-плакат: то же, что уйдёт в сторис и на лист, только мельче —
            человек должен видеть, что он раздаёт, до того как это напечатает. */}
        <div style={{
          position: 'relative', overflow: 'hidden', textAlign: 'center',
          borderRadius: '20px', padding: '26px 22px 22px',
          background: 'linear-gradient(180deg, #FDFCFB 0%, #F6EAE3 100%)',
          border: '1px solid rgba(var(--ink),0.05)',
        }}>
          <div style={{
            position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)',
            width: 420, height: 300, pointerEvents: 'none',
            background: 'radial-gradient(ellipse at center, rgba(252,174,145,0.45) 0%, rgba(252,174,145,0) 70%)',
          }} />

          <div style={{ position: 'relative' }}>
            {kicker && (
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase',
                color: '#B09C92', marginBottom: 8,
              }}>
                {kicker}
              </div>
            )}
            <div style={{ fontSize: 19, fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.4px', lineHeight: 1.2 }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#7A6E68', marginTop: 7 }}>
                {subtitle}
              </div>
            )}

            <div ref={svgRef} style={{
              display: 'inline-block', marginTop: 20, padding: 14, background: '#FFFFFF',
              borderRadius: '18px', boxShadow: '0 12px 32px rgba(26,26,26,0.10)', lineHeight: 0,
            }}>
              <QRCodeSVG value={url} size={168} level="M" bgColor="#FFFFFF" fgColor="#1A1A1A" marginSize={0} />
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A', marginTop: 16 }}>{shareTitle}</div>
            <div style={{ fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace', color: '#A8988F', marginTop: 5 }}>
              {pretty(url)}
            </div>
          </div>
        </div>

        {/* Второй экземпляр кода — растровый, только ради плаката сторис.
            Спрятан размером, а не display:none: у неотрисованного canvas
            нечего копировать на холст. */}
        <div ref={canvasRef} style={{ width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }} aria-hidden>
          <QRCodeCanvas value={url} size={640} level="M" bgColor="#FFFFFF" fgColor="#1A1A1A" marginSize={0} />
        </div>
      </ModalBody>

      <ModalFooter>
        {/* Два этажа, а не три кнопки в ряд: «Копировать · Печать · Для сторис»
            на 360px не помещаются ни на одном из языков продукта. Сторис —
            главное действие, поэтому отдельной строкой и во всю ширину. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="ghost" size="sm" fullWidth onClick={copy} icon={<IconCopy />}>{t('qr.copy')}</Button>
            <Button variant="ghost" size="sm" fullWidth onClick={print} icon={<IconPrint />}>{t('qr.print')}</Button>
          </div>
          <Button variant="primary" fullWidth loading={busy} onClick={story} icon={<IconStory />}>
            {t('qr.story')}
          </Button>
        </div>
      </ModalFooter>
    </ModalShell>
  );
}

const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="12" height="12" rx="2.5" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconPrint = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" rx="1.5" />
  </svg>
);

const IconStory = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="2" width="12" height="20" rx="3" />
    <path d="M12 8v7" /><path d="m9 12 3 3 3-3" />
  </svg>
);
