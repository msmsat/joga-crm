import { createJiti } from "jiti";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import fs from "node:fs";

globalThis.React = React;
const jiti = createJiti(import.meta.url, { jsx: true, interopDefault: true });
const S = {};
for (const f of ["mat", "gym", "studio", "care", "beauty", "recovery", "relax"]) {
  Object.assign(S, await jiti.import(`./src/components/modals/onboarding/scenes/${f}.tsx`));
}
const { Ambient } = await jiti.import("./src/components/modals/onboarding/scenes/rig.tsx");

const only = (process.argv[2] || "").split(",").filter(Boolean);
const names = Object.keys(S).filter(k => k.endsWith("Scene")).filter(n => !only.length || only.some(o => n.toLowerCase().startsWith(o.toLowerCase()))).sort();
const cards = names.map(n => {
  const svg = renderToStaticMarkup(
    React.createElement("svg", { viewBox: "0 0 300 200", xmlns: "http://www.w3.org/2000/svg", width: 480, height: 320 },
      React.createElement(Ambient), React.createElement(S[n])),
  );
  return `<figure><figcaption>${n}</figcaption>${svg}</figure>`;
}).join("\n");

fs.writeFileSync("scenes.preview.html", `<!doctype html><meta charset="utf-8"><style>
:root{--ink:26,26,26;--bg-card:#fff}
body{background:#FDFCFB;margin:0;padding:12px;font:12px/1.3 system-ui;display:flex;flex-wrap:wrap;gap:8px}
figure{margin:0;background:#fff;border-radius:12px;padding:4px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
figcaption{text-align:center;color:#666}
svg{display:block}
</style>${cards}
<script>
const t = parseFloat(new URLSearchParams(location.search).get("t") || "0");
for (const s of document.querySelectorAll("figure > svg")) { s.pauseAnimations(); s.setCurrentTime(t); }
document.title = "t=" + t;
<\/script>`);
console.log("ok", names.length, names.join(" "));
