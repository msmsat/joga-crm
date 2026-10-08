import { clsx } from 'clsx';
import s from './errorScreen.module.css';

interface TypingSceneProps {
  /** Идёт повторная попытка: печатает быстрее, код набирается заново, полоса прогресса. */
  retrying: boolean;
  /** Проиграть появление. Выключается, когда экран вернулся после неудачной попытки. */
  enter: boolean;
}

// Геометрия персонажа (viewBox 520×340). Ткань и кожа — классами модуля:
// в тёмной теме палитра сцены своя, иначе графитовая толстовка тонет в #121212.
const TORSO = 'M182 236C174 202 180 164 200 146C212 136 234 136 244 150C252 166 248 204 240 236Z';
const HOOD = 'M203 147C198 133 212 124 226 129C218 133 212 140 211 149Z';
const HAIR = 'M261 92C262 78 246 72 233 77C220 82 214 98 219 113C221 120 225 124 229 124C229 113 232 104 239 98C246 93 254 95 261 92Z';

// Человечек за ноутбуком. Один цикл анимации (--eb-cycle) — одна «попытка»:
// набрал четыре строки, на пятой вылезла ошибка, отпрянул, вчитался, стёр.
// Руки, голова и строки кода живут на общей шкале, поэтому совпадают по времени.
export function TypingScene({ retrying, enter }: TypingSceneProps) {
  return (
    <svg
      viewBox="0 0 520 340"
      className={clsx(s.scene, retrying && s.retrying, enter && s.enter)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="eb-blob">
          <stop offset="0%" className={s.blobIn} />
          <stop offset="100%" className={s.blobOut} />
        </radialGradient>
        <linearGradient id="eb-beam" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#FCAE91" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#FCAE91" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="eb-bar" x1="0" x2="1">
          <stop offset="0%" stopColor="#FCAE91" />
          <stop offset="100%" stopColor="#F9A08B" />
        </linearGradient>
        <filter id="eb-shadow" x="-20%" y="-20%" width="140%" height="170%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" className={s.shadow} />
        </filter>
      </defs>

      <g className={s.blobIntro}>
        <circle cx="300" cy="182" r="150" fill="url(#eb-blob)" className={s.blob} />
      </g>
      <ellipse cx="312" cy="318" rx="186" ry="6" className={s.ground} />

      {/* Кресло */}
      <rect x="140" y="148" width="14" height="88" rx="7" transform="rotate(-8 147 236)" className={s.fChair} />
      <rect x="185" y="243" width="7" height="52" rx="3" className={s.fChairShade} />
      <path d="M150 300Q188 290 226 300" className={clsx(s.limb, s.sChairShade)} strokeWidth="6" />
      <circle cx="152" cy="306" r="5" className={s.fChairShade} />
      <circle cx="224" cy="306" r="5" className={s.fChairShade} />
      <rect x="144" y="232" width="88" height="11" rx="5.5" className={s.fChair} />

      {/* Стол */}
      <rect x="300" y="214" width="7" height="102" rx="3" className={s.fDeskLeg} />
      <rect x="468" y="214" width="7" height="102" rx="3" className={s.fDeskLeg} />

      {/* Ноги: дальняя темнее, ближняя поверх */}
      <path d="M196 226L258 228L250 304" className={clsx(s.limb, s.sPantsShade)} strokeWidth="18" />
      <path d="M200 230L266 232L262 304" className={clsx(s.limb, s.sPants)} strokeWidth="19" />
      <path d="M242 300H262C274 300 282 306 282 313H242Z" className={s.fShoeShade} />
      <path d="M252 300H272C284 300 292 306 292 313H252Z" className={s.fShoe} />
      <rect x="250" y="312" width="44" height="4" rx="2" className={s.fSole} />

      <rect x="250" y="206" width="236" height="9" rx="4.5" className={s.fDesk} />

      {/* Ноутбук: экран смотрит на человека, поэтому виден ребром */}
      <rect x="294" y="200" width="96" height="6" rx="2.5" className={s.fLaptop} />
      <path d="M389 202L405 131" className={clsx(s.limb, s.sLid)} strokeWidth="5.5" />
      <path d="M386 201L402 130" className={clsx(s.limb, s.screen)} strokeWidth="1.6" />

      {/* Кружка */}
      <path d="M442 176q-4-6 0-12q4-6 0-12" className={clsx(s.limb, s.steam)} strokeWidth="2" />
      <path d="M450 178q-4-6 0-12q4-6 0-12" className={clsx(s.limb, s.steam, s.steamLate)} strokeWidth="2" />
      <path d="M456 189q8 0 8 6q0 6-8 6" className={clsx(s.limb, s.sMug)} strokeWidth="3" />
      <path d="M436 184h20v16a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6z" className={s.fMug} />
      <rect x="436" y="190" width="20" height="4" fill="#FCAE91" />

      {/* Свет экрана на лице */}
      <polygon points="402,131 386,201 268,124 264,90" fill="url(#eb-beam)" className={s.beam} />

      <g className={s.body}>
        {/* Дальняя рука — за корпусом */}
        <path d="M220 152L230 197" className={clsx(s.limb, s.sHoodieShade)} strokeWidth="14" />
        <g className={s.armFar}>
          <path d="M230 197L290 191" className={clsx(s.limb, s.sHoodieShade)} strokeWidth="12" />
          <rect x="286" y="185" width="20" height="9" rx="4.5" transform="rotate(8 286 189)" className={s.fSkinShade} />
          <path d="M300 192.5q4 1.5 5 5.5" className={clsx(s.limb, s.sSkinShade)} strokeWidth="3.2" />
        </g>

        <path d="M234 122L236 142" className={clsx(s.limb, s.sSkin)} strokeWidth="11" />
        <path d={TORSO} className={s.fHoodie} />
        <path d={HOOD} className={s.fHoodieShade} />
        <path d="M243 150L246 170" className={clsx(s.limb, s.sString)} strokeWidth="1.6" />

        <g className={s.head}>
          <circle cx="244" cy="104" r="21" className={s.fSkin} />
          <path d="M240 121C250 126 259 123 263.5 113L258 108Z" className={s.fSkin} />
          <path d="M264 97C268.5 101.5 269.5 106 264 110Z" className={s.fSkin} />
          <ellipse cx="238" cy="106" rx="4" ry="5.5" className={s.fSkinShade} />
          <path d={HAIR} className={s.fHair} />
          <ellipse cx="257" cy="101" rx="1.7" ry="2.3" className={clsx(s.fInk, s.eye)} />
          <path d="M252.5 94.5L259.5 93.8" className={clsx(s.limb, s.sInk)} strokeWidth="1.6" />
          <path d="M259 115.2Q261.4 115.8 263 114.6" className={clsx(s.limb, s.sSkinShade)} strokeWidth="1.3" />
          {/* Очки: в линзах отражается экран и мигает вместе с ним */}
          <rect x="251" y="96.5" width="11.5" height="8.5" rx="3" className={s.lens} strokeWidth="1.3" />
          <path d="M262.5 99.5L265 99M251 100L239.5 101.5" className={clsx(s.limb, s.sInk)} strokeWidth="1.3" />
        </g>

        {/* Ближняя рука — поверх корпуса */}
        <path d="M227 154L240 199" className={clsx(s.limb, s.sHoodieHi)} strokeWidth="15" />
        <g className={s.armNear}>
          <path d="M240 199L302 194" className={clsx(s.limb, s.sHoodieHi)} strokeWidth="13" />
          <rect x="298" y="188" width="21" height="9.5" rx="4.75" transform="rotate(8 298 192.75)" className={s.fSkin} />
          <path d="M313 196q4 1.5 5 5.5M307 197q3 1.5 3.6 4.6" className={clsx(s.limb, s.sSkin)} strokeWidth="3.2" />
        </g>
      </g>

      {/* Парящее окно редактора: то, что сейчас на экране */}
      <g className={s.panelIntro}>
        <g className={s.panelFloat}>
          <rect x="300" y="12" width="204" height="108" rx="14" className={s.panel} filter="url(#eb-shadow)" />
          <circle cx="318" cy="30" r="3.5" fill="#D88C9A" />
          <circle cx="330" cy="30" r="3.5" fill="#FCAE91" />
          <circle cx="342" cy="30" r="3.5" fill="#A3C9A8" />
          <rect x="440" y="27" width="46" height="6" rx="3" className={s.tx} />

          <g className={clsx(s.code, s.l1)}>
            <rect x="318" y="46" width="24" height="6" rx="3" className={s.kw} />
            <rect x="346" y="46" width="72" height="6" rx="3" className={s.tx} />
          </g>
          <g className={clsx(s.code, s.l2)}>
            <rect x="330" y="59" width="40" height="6" rx="3" className={s.tx} />
            <rect x="374" y="59" width="34" height="6" rx="3" className={s.kwSoft} />
          </g>
          <g className={clsx(s.code, s.l3)}>
            <rect x="330" y="72" width="92" height="6" rx="3" className={s.tx} />
          </g>
          <g className={clsx(s.code, s.l4)}>
            <rect x="342" y="85" width="62" height="6" rx="3" className={s.err} />
          </g>
          <g className={clsx(s.code, s.l5)}>
            <rect x="318" y="98" width="12" height="6" rx="3" className={s.tx} />
          </g>
          <rect x="408" y="83.5" width="2.2" height="9" rx="1.1" className={s.cursor} />

          <g className={s.badge}>
            <circle cx="484" cy="88" r="8" className={s.badgeBg} />
            {retrying
              ? <path d="M480.5 88.2l2.4 2.4 4.6-4.8" className={clsx(s.limb, s.sWhite)} strokeWidth="1.8" />
              : <path d="M484 84.2v4.6M484 91.6v.1" className={clsx(s.limb, s.sWhite)} strokeWidth="1.8" />}
          </g>

          {retrying && (
            <>
              <rect x="318" y="109" width="168" height="4" rx="2" className={s.track} />
              <rect x="318" y="109" width="168" height="4" rx="2" fill="url(#eb-bar)" className={s.bar} />
            </>
          )}
        </g>
      </g>
    </svg>
  );
}
