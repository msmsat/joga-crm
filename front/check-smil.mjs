// Проверка кадров SMIL: значений, фаз и кривых должно быть согласованное число,
// иначе браузер молча не запускает анимацию — сцена замирает на первом кадре.
import { createJiti } from "jiti";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

globalThis.React = React;
const jiti = createJiti(import.meta.url, { jsx: true, interopDefault: true });
const S = {};
for (const f of ["mat", "gym", "studio", "care", "beauty", "recovery", "relax"]) {
  Object.assign(S, await jiti.import(`./src/components/modals/onboarding/scenes/${f}.tsx`));
}
let bad = 0;
for (const name of Object.keys(S).filter(k => k.endsWith("Scene"))) {
  const html = renderToStaticMarkup(React.createElement("svg", null, React.createElement(S[name])));
  for (const tag of html.match(/<animate[^>]*>/g) || []) {
    const at = a => (tag.match(new RegExp(`${a}="([^"]*)"`)) || [])[1];
    const n = s => (s ? s.split(";").length : 0);
    const v = n(at("values")), kt = n(at("keyTimes")), ks = n(at("keySplines"));
    const err = [];
    if (kt && kt !== v) err.push(`values ${v} ≠ keyTimes ${kt}`);
    if (ks && ks !== v - 1) err.push(`keySplines ${ks} ≠ values-1 ${v - 1}`);
    const times = (at("keyTimes") || "").split(";").map(Number);
    if (kt && (times[0] !== 0 || times[kt - 1] !== 1)) err.push(`keyTimes ${times[0]}…${times[kt - 1]}`);
    if (kt && times.some((t, i) => i && t < times[i - 1])) err.push("keyTimes не возрастают");
    if (err.length) { bad++; console.log(`${name}: ${err.join(", ")}\n  ${tag.slice(0, 150)}`); }
  }
}
console.log(bad ? `\n${bad} сломанных анимаций` : "SMIL: все кадры согласованы");
process.exit(bad ? 1 : 0);
