"""Цвета сотрудников в журнале и цвета, которые им выдавать нельзя.

Журнал красит колонку и занятия мастера его цветом, а рядом в той же сетке
стоят блоки без занятий: перерыв (терракотовый персик), выходной (пыльная
роза) и «время студии» — уборка, планёрка (аква). Мастер в цвет такого блока
делает сетку нечитаемой: его занятие выглядит перерывом. Поэтому эти цвета —
за сотрудниками не числятся:

* палитра (STAFF_PALETTE) их не содержит;
* явный цвет, похожий на блок, схема правки не принимает (`reserved_color`);
* у кого такой уже есть — тому цвет меняется при запуске сервера
  (`members.repair_member_colors`) и при чтении команды (`fill_missing_colors`).

Здесь ни БД, ни сети — только цвета и арифметика, чтобы проверять их схеме,
сервису и тесту одинаково. Копия палитры для выбора в карточке и цвета блоков
— front/src/lib/staffColors.ts и StaffBlockCard.css.
"""
from typing import Optional

# Палитра. Порядок значим: первые цвета достаются первым сотрудникам, поэтому
# соседние в списке — самые непохожие. Тон средний: цвет служит и заливкой, и
# текстом карточки занятия, на светлой и на тёмной теме.
STAFF_PALETTE = (
    "#4A80C4",  # синий
    "#5BAB72",  # зелёный
    "#7B6CD4",  # фиолетовый
    "#E0A030",  # янтарь
    "#B062C0",  # орхидея
    "#8FA53A",  # олива
    "#5E7389",  # сланец
    "#8B6F5A",  # какао
)

# Акценты блоков журнала (светлая и тёмная тема) — StaffBlockCard.css.
# Меняешь цвет блока там — меняй и здесь, иначе мастер снова сможет его надеть.
BLOCK_COLORS = {
    "break": ("#B8684E", "#F3AF96"),
    "day_off": ("#A36478", "#DCA2B6"),
    "studio_time": ("#1D9CA3", "#63D2D3"),
}

# Цвета, которые раньше были в палитре и ушли из неё ради блоков: их носят
# мастера, заведённые до этого, — и они меняются, даже если формально дальше
# порога (малина от выходного — на самой границе).
RETIRED_COLORS = frozenset({
    "#F9A08B",  # персик — перерыв
    "#FCAE91",  # фирменный персик — перерыв
    "#C4553D",  # кирпич — перерыв
    "#D0678F",  # малина — выходной
    "#3AA39B",  # бирюза — время студии
})

# Ближе этого (ΔE76 в CIELAB) цвет читается «тем же», что блок. Самый близкий
# из оставшихся в палитре — какао у перерыва, 25; самый далёкий из ушедших —
# малина у выходного, 19.
_TOO_CLOSE = 21.0


def _lab(color: str) -> tuple[float, float, float]:
    h = color.lstrip("#")
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    r, g, b = (((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92 for c in rgb)
    x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
    y = r * 0.2126 + g * 0.7152 + b * 0.0722
    z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883

    def f(v: float) -> float:
        return v ** (1 / 3) if v > 0.008856 else 7.787 * v + 16 / 116

    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def _distance(a: str, b: str) -> float:
    return sum((p - q) ** 2 for p, q in zip(_lab(a), _lab(b))) ** 0.5


def _is_hex(color: Optional[str]) -> bool:
    if not color or len(color) != 7 or color[0] != "#":
        return False
    try:
        int(color[1:], 16)
    except ValueError:
        return False
    return True


def reserved_color(color: Optional[str]) -> Optional[str]:
    """Чей это цвет, если сотруднику его носить нельзя: `break`, `day_off`,
    `studio_time` (или `retired` — ушедший из палитры). None — цвет свободен.

    Не-hex (пусто, мусор) сюда не относится: его ловит шаблон схемы, а пустой
    цвет раздаёт `fill_missing_colors`.
    """
    if not _is_hex(color):
        return None
    upper = color.upper()
    nearest = min(
        ((_distance(upper, accent), kind) for kind, accents in BLOCK_COLORS.items() for accent in accents),
    )
    if nearest[0] < _TOO_CLOSE:
        return nearest[1]
    if upper in RETIRED_COLORS:
        return "retired"
    return None


def assert_free_color(color: Optional[str]) -> Optional[str]:
    """Валидатор поля `color` схем: цвет блока журнала — ошибка с подсказкой."""
    if reserved_color(color):
        raise ValueError(
            "Этот цвет занят блоками журнала (перерыв, выходной, время студии) — "
            "выберите из палитры: " + ", ".join(STAFF_PALETTE))
    return color
