import { FAR, GEAR, GEAR_SOFT, HOLD, MINT, NEAR, line } from "./kit";
import { Couch, Drift, Floor, Gear, Head, Morph, Move } from "./rig";

// Раздел «SPA и релакс»: здесь клиента никто не держит — записываются в ПОМЕЩЕНИЕ
// на время. Поэтому в сценах нет второй пары рук, а движется среда: вода, пар,
// тепло. Человечек в них почти неподвижен, и это не лень сцены, а её содержание.

const RIPPLE = "M-16 130 Q2 126 20 130 T56 130 T92 130 T128 130 T164 130 T200 130 T236 130 T272 130 T308 130 T344 130";

// ── SPA: купель ──────────────────────────────────────────────────────────────
// Три слоя ряби идут с разной скоростью — так плоская линия становится объёмом
// воды. Тело ниже верхней линии не рисуется вовсе: погружено, а не спрятано.
export function SpaScene() {
  return (
    <g>
      <Floor />
      <path d="M52 118 L60 164 Q150 172 240 164 L248 118 Z" fill={MINT} opacity="0.10" />
      <Gear d="M52 118 L60 164 Q150 172 240 164 L248 118" w={2.4} />

      <Morph far poses={[line([150, 122], [172, 118], [188, 126])]} />
      <Morph w={6} dur="6.4s" poses={[
        line([150, 122], [150, 100]),
        line([150, 123], [150, 101]),
        line([150, 122], [150, 100]),
      ]} />
      <Head dur="6.4s" at={[[150, 82], [150, 83], [149, 82], [150, 82]]} tilt={[0, 3, -3, 0]} />
      <Morph poses={[line([150, 122], [128, 118], [112, 126])]} />

      <Move dur="3.4s" ease={HOLD} at={[[0, 0], [-36, 0]]}>
        <path d={RIPPLE} fill="none" stroke={MINT} strokeWidth="1.8" opacity="0.5" />
      </Move>
      <Move dur="5.8s" ease={HOLD} at={[[0, 14], [-36, 14]]}>
        <path d={RIPPLE} fill="none" stroke={MINT} strokeWidth="1.4" opacity="0.24" />
      </Move>
      <Move dur="8.2s" ease={HOLD} at={[[0, 28], [-36, 28]]}>
        <path d={RIPPLE} fill="none" stroke={MINT} strokeWidth="1.2" opacity="0.14" />
      </Move>

      {/* Лепестки: единственное, что падает сверху, — по ним сцена и датируется */}
      <Drift from={[112, 54]} to={[104, 126]} dur="6s" fade={[0, 0.6, 0.5]}>
        <ellipse rx="5" ry="2.6" fill={NEAR} opacity="0.8" transform="rotate(-18)" />
      </Drift>
      <Drift from={[196, 44]} to={[204, 128]} dur="7.4s" delay="2.2s" fade={[0, 0.5, 0.4]}>
        <ellipse rx="4.4" ry="2.2" fill={FAR} opacity="0.8" transform="rotate(24)" />
      </Drift>
      <Drift from={[128, 116]} to={[122, 92]} dur="5.2s" delay="1s" fade={[0, 0.3, 0]}>
        <path d="M0 0 q5 -6 0 -12" fill="none" stroke={MINT} strokeWidth="1.5" strokeLinecap="round" />
      </Drift>
    </g>
  );
}

// ── Сауна: ковш над камнями ──────────────────────────────────────────────────
// Ковш наклоняется раз в цикл, и ровно с этого момента пар идёт гуще. Причина и
// следствие в одном такте — иначе пар читался бы как фон, а не как поддача.
const SAU = "7s";
const ST = [0, 0.34, 0.42, 0.5, 0.62, 0.9, 1];

export function SaunaScene() {
  return (
    <g>
      <Floor />
      {/* Полок: две доски одна над другой, нижняя — подставка под стопы */}
      <rect x="56" y="138" width="120" height="9" rx="3" style={{ fill: GEAR }} />
      <rect x="56" y="158" width="120" height="7" rx="3" style={{ fill: GEAR_SOFT }} />
      <Gear d="M68 147 L68 168 M166 147 L166 168" w={2.6} />

      <Morph far poses={[line([120, 138], [100, 148], [98, 162])]} />
      <Morph far poses={[line([120, 114], [104, 126], [96, 138])]} />
      <Morph poses={[line([120, 138], [96, 146], [94, 162])]} />
      <Morph w={6} dur={SAU} poses={[
        line([120, 138], [120, 110]),
        line([120, 139], [120, 111]),
        line([120, 138], [120, 110]),
      ]} />
      <Head dur={SAU} at={[[120, 92], [120, 93], [120, 92]]} tilt={[0, 4, 0]} />

      {/* Ковш на ДЛИННОЙ ручке: рука держит её у себя, чаша висит над камнями.
          Иначе человек держал бы саму чашу, а поддавать было бы некуда — до
          каменки полкадра. Наклон 22° опускает чашу ровно на камни. */}
      <Morph dur={SAU} keys={ST} poses={[
        line([120, 114], [140, 108], [154, 98]),
        line([120, 114], [142, 106], [158, 100]),
        line([120, 114], [142, 106], [158, 100]),
        line([120, 114], [142, 106], [158, 100]),
        line([120, 114], [141, 107], [156, 99]),
        line([120, 114], [140, 108], [154, 98]),
        line([120, 114], [140, 108], [154, 98]),
      ]} />
      <Move dur={SAU} keys={ST}
        at={[[154, 98], [158, 100], [158, 100], [158, 100], [156, 99], [154, 98], [154, 98]]}
        spin={[0, 0, 22, 0, 0, 0, 0]}>
        <Gear d="M2 0 L24 3" w={2.4} />
        <path d="M24 2 q10 0 10 7 q0 6 -9 6 q-10 0 -10 -6 q0 -7 9 -7 Z" style={{ fill: GEAR }} />
      </Move>

      {/* Каменка стоит на полу, камни лежат в её устье */}
      <rect x="180" y="118" width="48" height="50" rx="6" fill="none" strokeWidth="2.4" style={{ stroke: GEAR }} />
      <Gear d="M192 148 L216 148" w={2.4} soft />
      <ellipse cx="191" cy="116" rx="6" ry="3.4" style={{ fill: GEAR }} />
      <ellipse cx="204" cy="114" rx="6" ry="3.4" style={{ fill: GEAR }} />
      <ellipse cx="216" cy="117" rx="5.4" ry="3.2" style={{ fill: GEAR }} />

      <Drift from={[194, 112]} to={[186, 58]} dur={SAU} fade={[0, 0, 0.42, 0]}>
        <path d="M0 0 q6 -8 0 -16 q-6 -8 0 -16" fill="none" stroke={MINT} strokeWidth="1.8" strokeLinecap="round" />
      </Drift>
      <Drift from={[212, 113]} to={[222, 62]} dur={SAU} fade={[0, 0, 0.34, 0]}>
        <path d="M0 0 q-6 -8 0 -16 q6 -8 0 -16" fill="none" stroke={MINT} strokeWidth="1.6" strokeLinecap="round" />
      </Drift>
      <Drift from={[204, 110]} to={[200, 54]} dur="5.6s" delay="1.4s" fade={[0, 0.2, 0]}>
        <path d="M0 0 q5 -7 0 -14" fill="none" stroke={MINT} strokeWidth="1.4" strokeLinecap="round" />
      </Drift>
    </g>
  );
}

// ── Обёртывания: тепло под плёнкой ───────────────────────────────────────────
// Три полосы поперёк тела и медленная тёплая волна, идущая от ног к плечам.
// Ничего не происходит — процедура и состоит в том, чтобы лежать и греться.
const WRP = "8s";

export function WrapsScene() {
  return (
    <g>
      <Couch />

      <Morph far poses={[line([176, 140], [206, 144], [232, 146], [240, 140])]} />
      <Morph far poses={[line([120, 134], [136, 126], [152, 130])]} />
      <Morph poses={[line([176, 136], [206, 140], [232, 142], [240, 136])]} />
      <Morph w={6} dur={WRP} poses={[
        "M176 132 Q148 128 120 130",
        "M176 132 Q148 125.5 120 128.5",
        "M176 132 Q148 128 120 130",
      ]} />
      <Head at={[[100, 126]]} tilt={[-4]} face={-1} />
      <Morph poses={[line([120, 131], [138, 123], [156, 128])]} />

      {/* Плёнка: сплошная заливка поверх тела и три перетяжки */}
      <path d="M124 122 Q160 116 214 128 L216 144 Q160 150 124 140 Z" fill={MINT} opacity="0.16" />
      <path d="M124 122 Q160 116 214 128 L216 144 Q160 150 124 140 Z" fill="none" strokeWidth="1.3" style={{ stroke: GEAR_SOFT }} />
      <Gear d="M142 120 L144 143 M172 121 L174 146 M202 125 L204 148" w={2} soft />

      <Drift from={[206, 124]} to={[130, 118]} dur={WRP} fade={[0, 0.5, 0]}>
        <path d="M-14 0 q7 -5 14 0 q7 5 14 0" fill="none" stroke={NEAR} strokeWidth="1.8" strokeLinecap="round" />
      </Drift>
      <Drift from={[210, 134]} to={[134, 128]} dur={WRP} delay="3s" fade={[0, 0.34, 0]}>
        <path d="M-12 0 q6 -4 12 0 q6 4 12 0" fill="none" stroke={FAR} strokeWidth="1.6" strokeLinecap="round" />
      </Drift>
      <Drift from={[150, 116]} to={[144, 92]} dur="6.4s" delay="1.2s" fade={[0, 0.26, 0]}>
        <path d="M0 0 q5 -6 0 -12" fill="none" stroke={MINT} strokeWidth="1.5" strokeLinecap="round" />
      </Drift>
    </g>
  );
}
