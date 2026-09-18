"""Таблица валют одна на весь продукт.

Источник — `front/src/utils/currency.ts`: там код, знак и комментарий, ради
какой страны валюта заведена. Сервер держит две копии, и обе обязаны совпадать
с ним посимвольно:

* `schemas.settings.general.Currency` — что вообще принимается в настройках.
  Разошлось — студия выбирает валюту в онбординге, а сохранить её в Настройках
  уже не может: 422 на ровном месте.
* `services.notifier._CURRENCY_SIGNS` — чем сумма подписана в письме, в шаблоне
  WhatsApp и в `price_str` мини-приложения. Разошлось — в кабинете «KSh 500»,
  а в письме тому же клиенту «KES 500».

Валют больше сотни (список собран от языков интерфейса, а не от стран продаж),
и сверять их глазами при каждой правке невозможно. Поэтому сверяет тест.
"""
import re
from pathlib import Path

import pytest

from schemas.settings.general import Currency
from services.notifier import _CURRENCY_SIGNS

try:  # Literal.__args__ есть у всех поддерживаемых версий, но падать на импорте не за что
    SERVER_CODES = set(Currency.__args__)
except AttributeError:  # pragma: no cover
    SERVER_CODES = set()

FRONT = Path(__file__).resolve().parents[2] / "front" / "src"
CURRENCY_TS = FRONT / "utils" / "currency.ts"
GEO_TS = FRONT / "utils" / "geo.ts"

pytestmark = pytest.mark.skipif(not FRONT.is_dir(), reason="нет исходников фронтенда рядом с back/")


def _front_table() -> dict[str, str]:
    source = CURRENCY_TS.read_text(encoding="utf-8")
    rows = re.findall(r'\{ value: "([A-Z]{3})", symbol: "([^"]+)" \}', source)
    assert len(rows) > 100, f"из currency.ts вычитано всего {len(rows)} валют — проверка ослепла"
    table = dict(rows)
    assert len(table) == len(rows), "в currency.ts повторяется код валюты"
    return table


def test_accepted_codes_match_front():
    assert SERVER_CODES == set(_front_table()), (
        "список Currency в schemas/settings/general.py разошёлся с front/src/utils/currency.ts"
    )


def test_signs_match_front():
    assert _CURRENCY_SIGNS == _front_table(), (
        "знаки валют в services/notifier.py разошлись с front/src/utils/currency.ts"
    )


def test_geo_map_returns_only_known_codes():
    """Страна визита не может подсказать валюту, которой сервер не примет."""
    codes = set(re.findall(r'^\s*[A-Z]{2}: "([A-Z]{3})",', GEO_TS.read_text(encoding="utf-8"), re.M))
    assert len(codes) > 50, "из geo.ts вычитано подозрительно мало валют — проверка ослепла"
    assert codes <= SERVER_CODES, f"geo.ts отдаёт валюты, которых нет в Currency: {sorted(codes - SERVER_CODES)}"
