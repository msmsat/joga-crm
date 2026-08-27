import { Fragment } from "react";
import type { ReactNode } from "react";

/**
 * Разметка внутри переводов лендинга. В JSON нельзя положить JSX, а вёрстка
 * заголовков от языка зависит: перенос строки в «Одна платформа / вместо
 * десятка сервисов» по-немецки приходится на другое слово. Поэтому две
 * договорённости на весь неймспейс `landing`:
 *
 *   \n       — перенос строки в заголовке;
 *   **...**  — жирный фрагмент внутри абзаца;
 *   *...*    — акцентное (персиковое) слово в заголовке героя.
 *
 * Больше ничего: это не markdown, парсер тут намеренно на десять строк.
 */

/** Многострочный заголовок: `\n` → перенос. */
export function lines(text: string): ReactNode {
  return text.split("\n").map((line, i, all) => (
    <Fragment key={i}>
      {line}
      {i < all.length - 1 && <br />}
    </Fragment>
  ));
}

/** Абзац с жирными фрагментами: `**15 €**`. */
export function bold(text: string, className = "font-bold text-white"): ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    // Нечётные куски — то, что стояло между звёздочками (свойство split с группой).
    i % 2 === 1 ? <span key={i} className={className}>{part}</span> : <Fragment key={i}>{part}</Fragment>
  );
}

/** Слово заголовка героя: акцентное ли оно и нужен ли после него перенос. */
export type HeroWord = { text: string; accent: boolean; br: boolean };

/**
 * Заголовок героя словами — они выезжают по очереди, поэтому строка обязана
 * разбираться на слова, а не на строки. `*слово*` — персиковый акцент с
 * росчерком, конец строки помечается у последнего слова этой строки.
 */
export function heroWords(title: string): HeroWord[] {
  const rows = title.split("\n");
  return rows.flatMap((row, ri) => {
    const words = row.split(/\s+/).filter(Boolean);
    return words.map((word, wi) => ({
      text: word.replace(/^\*|\*$/g, ""),
      accent: word.startsWith("*") && word.endsWith("*"),
      br: ri < rows.length - 1 && wi === words.length - 1,
    }));
  });
}
