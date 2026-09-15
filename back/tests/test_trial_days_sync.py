"""Длина пробного периода одна на весь продукт.

Срок ставит сервер (`routers.billing.plans.TRIAL_DAYS`), но то же число
написано ещё в трёх местах, где его читает человек до всякого запроса к API:
копия `TRIAL_DAYS` во фронте (окно акции и плашка на «Тарифе и оплате»),
тексты лендинга на пяти языках и страницы входа/регистрации. Поменяли срок
в одном месте — лендинг обещает одно, а сервер выдаёт другое. Этот тест
падает раньше, чем такое уедет в прод.
"""
import json
import re
from pathlib import Path

import pytest

from routers.billing.plans import TRIAL_DAYS

FRONT = Path(__file__).resolve().parents[2] / "front" / "src"

# «N дней» в каждом языке лендинга. Других количеств дней в этих файлах нет —
# значит, любое число здесь и есть обещанный пробный период.
LANDING_DAYS = {
    "ru": r"(\d+) дней",
    "en": r"(\d+) days",
    "uk": r"(\d+) днів",
    "cs": r"(\d+) dní",
    "de": r"(\d+) Tage",
}


pytestmark = pytest.mark.skipif(not FRONT.is_dir(), reason="нет исходников фронтенда рядом с back/")


def test_front_constant_matches_server():
    source = (FRONT / "api" / "billing" / "billing.types.ts").read_text(encoding="utf-8")
    match = re.search(r"export const TRIAL_DAYS = (\d+)", source)
    assert match, "в billing.types.ts пропала константа TRIAL_DAYS"
    assert int(match.group(1)) == TRIAL_DAYS


@pytest.mark.parametrize("lang", sorted(LANDING_DAYS))
def test_landing_promises_server_trial(lang):
    text = (FRONT / "locales" / lang / "landing.json").read_text(encoding="utf-8")
    json.loads(text)  # битый JSON уронил бы лендинг целиком — ловим здесь же
    found = {int(n) for n in re.findall(LANDING_DAYS[lang], text)}
    assert found == {TRIAL_DAYS}, f"{lang}/landing.json обещает {sorted(found)} дней, сервер даёт {TRIAL_DAYS}"


@pytest.mark.parametrize("page", ["Loginpage.tsx", "Registerpage.tsx"])
def test_auth_pages_take_days_from_constant(page):
    source = (FRONT / "pages" / page).read_text(encoding="utf-8")
    assert not re.search(r"\d+ дней бесплатно", source), f"{page}: срок триала вписан числом, а не TRIAL_DAYS"
