"""Регистрация запоминает браузер, с которого пришла: без этого воронка
визит → регистрация не собирается.

Запуск из back/:  pytest tests/test_register_anon_id.py -v
"""
import warnings

warnings.filterwarnings("ignore")

from schemas import RegisterRequest


def test_anon_id_is_optional():
    # Необязательное поле: старый бандл в кэше браузера и прямые вызовы API
    # обязаны продолжать работать.
    body = RegisterRequest(
        email="anon-probe@velora.online", name="A", password="koala-7-Dunes!", accept_terms=True
    )
    assert body.anon_id is None


def test_anon_id_is_accepted_and_clipped():
    body = RegisterRequest(
        email="anon-probe@velora.online",
        name="A",
        password="koala-7-Dunes!",
        accept_terms=True,
        anon_id="x" * 500,
    )
    assert body.anon_id is not None
    assert len(body.anon_id) <= 64
