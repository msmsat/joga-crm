/**
 * Проверяет сцены онбординга (components/modals/onboarding/scenes) — то, что
 * билд и eslint пропускают молча.
 *
 * Кадровая анимация в сценах — это SMIL: `values`, `keyTimes` и `keySplines`
 * должны быть согласованы по числу. Если их развести (добавить позу и забыть
 * фазу), браузер НЕ ругается и НЕ падает — он просто не запускает анимацию.
 * Сцена застывает на первом кадре, и заметить это можно только глазами, открыв
 * нужное направление в списке из тридцати. Ровно поэтому проверка здесь.
 *
 * Правила SMIL, которые тут и проверяются:
 *   values ≡ keyTimes по числу,  keySplines = values − 1,
 *   keyTimes начинается с 0, заканчивается 1 и не убывает.
 *
 * Сцены — это TSX, поэтому скрипту нужен jiti (приезжает вместе с vite).
 *
 * Запуск:  npm run check:scenes
 */
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import path from "node:path";

globalThis.React = React; // jiti собирает JSX в классический React.createElement

let createJiti;
try {
  ({ createJiti } = await import("jiti"));
} catch {
  console.error("Не найден jiti (ставится вместе с vite): npm i");
  process.exit(1);
}

const DIR = path.join(import.meta.dirname, "..", "src/components/modals/onboarding/scenes");
const jiti = createJiti(import.meta.url, { jsx: true, interopDefault: true });

const scenes = {};
for (const file of ["mat", "gym", "studio", "care", "beauty", "recovery", "relax"]) {
  Object.assign(scenes, await jiti.import(path.join(DIR, `${file}.tsx`)));
}

const names = Object.keys(scenes).filter(k => k.endsWith("Scene"));
const fail = [];

for (const name of names) {
  const html = renderToStaticMarkup(React.createElement("svg", null, React.createElement(scenes[name])));
  for (const tag of html.match(/<animate[^>]*>/g) || []) {
    const attr = a => (tag.match(new RegExp(`${a}="([^"]*)"`)) || [])[1];
    const count = s => (s ? s.split(";").length : 0);
    const values = count(attr("values"));
    const keyTimes = count(attr("keyTimes"));
    const splines = count(attr("keySplines"));
    const times = (attr("keyTimes") || "").split(";").map(Number);

    if (keyTimes && keyTimes !== values) fail.push(`${name}: кадров ${values}, фаз ${keyTimes}`);
    if (splines && splines !== values - 1) fail.push(`${name}: кривых ${splines}, а надо ${values - 1}`);
    if (keyTimes && (times[0] !== 0 || times[keyTimes - 1] !== 1)) {
      fail.push(`${name}: keyTimes идут ${times[0]}…${times[keyTimes - 1]}, а обязаны 0…1`);
    }
    if (keyTimes && times.some((t, i) => i && t < times[i - 1])) fail.push(`${name}: keyTimes убывают`);
  }
}

if (fail.length) {
  console.error(`Сцены онбординга: ${fail.length} сломанных анимаций\n`);
  for (const line of fail) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`Сцены онбординга: ${names.length} сцен, кадры согласованы`);
