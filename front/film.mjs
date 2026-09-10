import { createJiti } from "jiti";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import fs from "node:fs";

globalThis.React = React;
const jiti = createJiti(import.meta.url, { jsx: true, interopDefault: true, moduleCache: false, fsCache: false });
const S = {};
for (const f of ["mat", "gym", "studio", "care", "beauty", "recovery", "relax"]) {
  Object.assign(S, await jiti.import(`./src/components/modals/onboarding/scenes/${f}.tsx?t=${Date.now()}`));
}

// node film.mjs Yoga,Pilates 0,1,2,3   → строка кадров на каждую сцену
const [namesArg, timesArg, sizeArg] = process.argv.slice(2);
const names = namesArg.split(",").map(n => Object.keys(S).find(k => k.toLowerCase() === n.toLowerCase() + "scene") || n);
const times = (timesArg || "0").split(",").map(Number);
const W = Number(sizeArg || 400);
const rows = names.map(name => {
  const svg = renderToStaticMarkup(
    React.createElement("svg", { viewBox: "0 0 300 200", xmlns: "http://www.w3.org/2000/svg", width: W, height: W / 1.5 },
      React.createElement(S[name])),
  );
  return `<div class=row>${times.map(t => `<figure data-t="${t}"><figcaption>${name} t=${t}</figcaption>${svg}</figure>`).join("")}</div>`;
}).join("\n");
fs.writeFileSync("scenes.preview.html", `<!doctype html><meta charset="utf-8"><style>
:root{--ink:26,26,26;--bg-card:#fff}
body{background:#FDFCFB;margin:0;padding:8px;font:11px/1.2 system-ui}
.row{display:flex;gap:4px;margin-bottom:4px}
figure{margin:0;background:#fff;border-radius:8px;padding:2px}
figcaption{text-align:center;color:#666}
svg{display:block;background:
  repeating-linear-gradient(to right,rgba(0,0,0,.05) 0 1px,transparent 1px ${W / 300 * 20}px),
  repeating-linear-gradient(to bottom,rgba(0,0,0,.05) 0 1px,transparent 1px ${W / 300 * 20}px)}
</style>${rows}
<script>
for (const f of document.querySelectorAll("figure")) {
  const s = f.querySelector("svg"); s.pauseAnimations(); s.setCurrentTime(+f.dataset.t);
}
<\/script>`);
console.log("ok", names.join(" "), "|", times.join(" "));
