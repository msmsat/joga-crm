// Стабилизация черновика стрима (эпик AI-6, задача 3). Токены приходят кусками,
// и markdown-рендер получает заведомо незакрытые блоки: половину таблицы,
// открытый ```velora-chart без закрывающей строки. Показывать их «как есть»
// значит мигать разметкой — таблица растёт построчно, график вспыхивает из
// куска JSON. Пока блок не закрылся, его содержимое показываем текстом.
//
// ponytail: обрезаем незакрытый хвост вместо инкрементального парсера —
// менять, если появятся длинные вложенные структуры.

const FENCE = '```';

function isFence(line: string): boolean {
  return line.trimStart().startsWith(FENCE);
}

function isTableRow(line: string): boolean {
  return line.trimStart().startsWith('|');
}

/** streaming=false — текст как есть, без единой правки: готовый ответ трогать нельзя. */
export function stableMarkdown(text: string, streaming = false): string {
  if (!streaming || !text) return text;
  let lines = text.split('\n');

  // Нечётное число ``` — блок ещё открыт. Снимаем строку открытия: содержимое
  // отрисуется абзацем, а графиком или кодом станет, когда придёт закрывающая.
  if (lines.filter(isFence).length % 2 === 1) {
    const open = lines.map(isFence).lastIndexOf(true);
    lines = [...lines.slice(0, open), ...lines.slice(open + 1)];
  }

  // Таблица, дописываемая прямо сейчас (ряд строк «|…» упирается в конец
  // текста), не показывается вовсе — иначе она собирается на глазах построчно.
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  let start = end;
  while (start > 0 && isTableRow(lines[start - 1])) start--;
  if (start < end) lines = lines.slice(0, start);

  return lines.join('\n');
}
