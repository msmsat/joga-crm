import { useEffect, useLayoutEffect, useState } from 'react';
import { PageSlider, type PageSliderConfig, type SlideTarget } from '../lib/pageSlider';

/**
 * Листание разделов на телефоне: свайп между ними и проезд ленты по тапу в
 * меню (вся механика — lib/pageSlider.ts).
 *
 * Возвращает `go` — тап по меню (`false`: проехать нельзя, переключать
 * мгновенно) и `target` — раздел, к которому лента уже едет: меню показывает
 * его сразу, страница становится текущей, когда доедет.
 */
export function usePageSlide(options: PageSliderConfig) {
  const [target, setTarget] = useState<SlideTarget | null>(null);
  const [slider] = useState(() => new PageSlider(setTarget));
  // Раздел сменился мимо ленты — её цель больше ничего не значит.
  if (target && target.from !== options.active) setTarget(null);

  // Каждый рендер: обработчики касаний читают свежие разделы и колбэки, а
  // подписка на документ при этом не переставляется.
  useLayoutEffect(() => {
    slider.configure(options);
  });
  useLayoutEffect(() => slider.sync(options.active), [slider, options.active]);
  useEffect(() => (options.enabled ? slider.listen() : undefined), [slider, options.enabled]);

  return { target: target?.to ?? null, go: slider.go };
}
