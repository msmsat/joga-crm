import { useLayoutEffect, useState } from 'react';

// ─── QR-КОД ПОД ВЫСОТУ ЭКРАНА ────────────────────────────────────────────────
// Окно с кодом при фиксированном коде в 168px было выше ~620px. В браузере
// ноутбука (1280×720 и 150 % масштаба — это ~600px видимой высоты) и в шите
// телефона (92 % экрана) тело окна уходило в прокрутку, и код срезался краем —
// ровно то, ради чего окно открывали.
//
// Поэтому размер кода выводится из места, а не задаётся числом: замеряем, на
// сколько окно выше своего max-height (или ниже), и на столько же меняем код —
// высота окна линейна по размеру кода, одного замера хватает. Если и
// минимального кода мало, окно сначала ужимает обвязку (compact: без
// подзаголовка и надстрочника), и только потом тело прокручивается — тогда
// прокрутка встаёт так, чтобы код был виден целиком.

const MIN = 128;
const MAX = 208;
// Сколько освобождает compact — с запасом. Обратно из compact выходим, только
// если места больше, иначе окно моргало бы туда-сюда на одной высоте.
const COMPACT_GAIN = 96;

export interface QrFit { size: number; compact: boolean }

/**
 * @param anchorRef плакат внутри ModalBody окна кита: по нему ищутся тело
 *                  `.ms-scroll` и карточка `.v-modal`, его высота — повод перемерить.
 * @param qrRef     плита с кодом — её держим в поле зрения, если всё же прокрутка.
 * @param deps      то, от чего зависит высота текста (заголовок, подписи).
 */
export function useQrFit(
  anchorRef: React.RefObject<HTMLElement | null>,
  qrRef: React.RefObject<HTMLElement | null>,
  deps: readonly unknown[],
): QrFit {
  const [fit, setFit] = useState<QrFit>({ size: MAX, compact: false });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const body = anchor?.closest<HTMLElement>('.ms-scroll');
    const card = anchor?.closest<HTMLElement>('.v-modal');
    if (!anchor || !body || !card) return;

    const measure = () => {
      const limit = parseFloat(getComputedStyle(card).maxHeight);
      if (!Number.isFinite(limit)) return;
      // Высота окна без прокрутки: шапка и подвал + всё содержимое тела.
      // Шапку с подвалом берём разницей, а не высотой карточки: пока окно
      // доезжает до новой высоты (useSmoothHeight), сжимается только тело.
      const natural = card.offsetHeight - body.clientHeight + body.scrollHeight;
      // Два пикселя запаса: высоты дробные, а offsetHeight округлён, и впритык
      // тело переполнялось на пиксель — появлялась полоса прокрутки.
      const slack = Math.floor(limit - natural) - 2;
      setFit(prev => {
        const want = prev.size + slack;
        if (!prev.compact && want < MIN) return { ...prev, compact: true };
        if (prev.compact && want >= MIN + COMPACT_GAIN) return { ...prev, compact: false };
        const size = Math.max(MIN, Math.min(MAX, want));
        return size === prev.size ? prev : { ...prev, size };
      });
    };

    measure();
    // Шрифт плаката догружается позже первого кадра, и переносы заголовка
    // меняются — следим за высотой самого плаката. Своя смена размера кода
    // сюда тоже приходит, но повторный замер даёт тот же размер (формула
    // линейная) и ничего не меняет. Через кадр — иначе наблюдатель ругается
    // на цикл: замер в его же обратном вызове снова меняет размер.
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    ro.observe(anchor);
    const vv = window.visualViewport;
    window.addEventListener('resize', measure);
    vv?.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      vv?.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit.compact, ...deps]);

  // Даже минимальный код не влез — прокручиваем тело так, чтобы код стоял
  // посередине, а не уходил под подвал.
  useLayoutEffect(() => {
    const qr = qrRef.current;
    const body = qr?.closest<HTMLElement>('.ms-scroll');
    if (!qr || !body || body.scrollHeight <= body.clientHeight) return;
    const q = qr.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    body.scrollTop += (q.top + q.height / 2) - (b.top + b.height / 2);
  }, [fit, qrRef]);

  return fit;
}
