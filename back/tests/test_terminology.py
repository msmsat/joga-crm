import copy
import json
import pathlib
import re
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from services import terminology as terms


@pytest.mark.parametrize("locale", sorted(terms.LOCALES))
@pytest.mark.parametrize("profile", sorted(terms.PROFILES))
@pytest.mark.parametrize("mode", ["event", "resource"])
def test_complete_templates_and_forms(locale, profile, mode):
    result = terms.resolve_terms(profile, locale, mode)
    assert result["locale"] == locale and result["profile"] == profile
    assert set(result["messages"]) == terms.MESSAGE_KEYS
    for template in result["messages"].values():
        rendered = template.replace("{{staff.accusative}}", result["staff"]["accusative"])
        rendered = rendered.replace("{{offering.accusative}}", result["offering"]["accusative"])
        assert rendered.strip() and not any(char in rendered for char in "{}<>")


@pytest.mark.parametrize("locale", sorted(terms.LOCALES))
@pytest.mark.parametrize("profile", sorted(terms.PROFILES))
def test_space_word_is_complete_everywhere(locale, profile):
    """Слово для места переведено во всех языках — иначе барбершоп на чешском
    увидит в каталоге пустую подпись вместо «křeslo»."""
    space = terms.resolve_terms(profile, locale, "resource")["space"]
    assert set(space) == {"singular", "plural", "accusative"}
    for form in space.values():
        assert form.strip() and not any(char in form for char in "{}<>")


def test_fallback_is_a_complete_language_and_results_do_not_mutate_cache():
    unknown = terms.resolve_terms("not-a-profile", "xx-YY", "resource")
    assert unknown == terms.resolve_terms(terms.FALLBACK_PROFILE, "en", "resource")
    assert terms.resolve_terms("sport", "ru-RU", "event")["locale"] == "ru"
    unknown["staff"]["singular"] = "modified"
    unknown["messages"].clear()
    assert terms.resolve_terms(terms.FALLBACK_PROFILE, "en", "resource")["staff"]["singular"] != "modified"
    studio = SimpleNamespace(language="ru", terminology_profile="beauty", space_is_axis=None)
    config = terms.configuration(studio)
    config["profiles"].clear()
    assert set(terms.configuration(studio)["profiles"]) == terms.PROFILES


@pytest.mark.parametrize("legacy,expected", sorted(terms.LEGACY_PROFILES.items()))
def test_legacy_profile_names_still_resolve(legacy, expected):
    """Имя из уже выданного клиентского кэша обязано попасть в свой словарь, а
    не в чужой: `generic` — это сегодняшний `other`, а не `beauty`."""
    assert terms.profile_key(legacy) == expected
    assert terms.resolve_terms(legacy, "ru", "resource")["profile"] == expected


def test_legacy_rename_keeps_every_word_identical():
    """generic→other и fitness→sport переименование, а не смена словаря:
    у студии, которая ничего не трогала, ни одно слово не должно поменяться."""
    for legacy, expected in (("generic", "other"), ("fitness", "sport")):
        for locale in sorted(terms.LOCALES):
            before = terms._load(locale).profiles[expected]
            assert terms.resolve_terms(legacy, locale, "event")["staff"] == before.staff.model_dump()
            assert terms.resolve_terms(legacy, locale, "event")["offering"] == before.offering.event.model_dump()


@pytest.mark.parametrize("profile", sorted(terms.PROFILES))
def test_space_axis_is_declared_for_every_profile(profile):
    assert profile in terms.SPACE_IS_AXIS


def test_owner_toggle_overrides_the_industry_and_nothing_else_does():
    assert terms.space_is_axis("beauty") is False
    assert terms.space_is_axis("studio") is True
    assert terms.space_is_axis("beauty", True) is True
    assert terms.space_is_axis("studio", False) is False
    # None — это «наследовать отрасль», а не «выключено».
    assert terms.space_is_axis("studio", None) is True
    assert terms.space_is_axis("beauty", None) is False


def test_configuration_reports_the_resolved_axis():
    studio = SimpleNamespace(language="ru", terminology_profile="beauty", space_is_axis=None)
    assert terms.configuration(studio)["space_is_axis"] is False
    studio.space_is_axis = True
    assert terms.configuration(studio)["space_is_axis"] is True
    # Профили в ответе несут СВОЙ отраслевой признак, не переопределённый:
    # карточка настроек показывает по нему подпись «по умолчанию для отрасли».
    assert terms.configuration(studio)["profiles"]["beauty"]["space_is_axis"] is False


@pytest.mark.parametrize("subtype,expected", [
    ("barbershop", "beauty"),
    ("barbershop,hair_salon,nails", "beauty"),
    ("yoga,pilates", "studio"),
    ("gym", "sport"),
    ("massage,osteopathy", "recovery"),
    ("spa,sauna", "relax"),
    ("other", "other"),
    ("", "other"),
    (None, "other"),
    # Неизвестное направление не утаскивает студию в other только потому,
    # что стоит первым в списке.
    ("zzz,barbershop", "beauty"),
])
def test_profile_for_activities(subtype, expected):
    assert terms.profile_for_activities(subtype) == expected


def test_activity_table_matches_the_onboarding_screen():
    """PROFILE_ACTIVITIES — копия ACTIVITY_SECTIONS с фронта. Копия осознанная,
    но молча разъехаться она не должна: новое направление в онбординге без
    строки здесь ушло бы в `other` и дало студии чужие слова."""
    source = pathlib.Path(__file__).resolve().parents[2] / "front" / "src" / "components" / "UI.tsx"
    if not source.exists():
        pytest.skip("фронт недоступен в этом окружении")
    text = source.read_text(encoding="utf-8")
    block = re.search(r"export const ACTIVITY_SECTIONS = \[(.*?)\n\];", text, re.S)
    assert block, "ACTIVITY_SECTIONS не найден — правь этот тест вместе с UI.tsx"
    found = {
        section: tuple(re.findall(r'"([^"]+)"', items))
        for section, items in re.findall(r'id:\s*"(\w+)",.*?items:\s*\[([^\]]*)\]', block.group(1), re.S)
    }
    assert found == {key: tuple(value) for key, value in terms.PROFILE_ACTIVITIES.items()}


@pytest.mark.parametrize("mutation", ["missing", "unknown", "html", "interpolation", "empty", "form", "no_space"])
def test_invalid_presets_fail_validation(mutation):
    payload = copy.deepcopy(terms._load("ru").model_dump())
    profile = payload["profiles"][terms.FALLBACK_PROFILE]
    if mutation == "missing":
        profile["messages"].pop("choose_staff")
    elif mutation == "unknown":
        profile["messages"]["extra"] = "Extra"
    elif mutation == "html":
        profile["messages"]["choose_staff"] = "<script>bad</script>"
    elif mutation == "interpolation":
        profile["messages"]["choose_staff"] = "{{client.email}}"
    elif mutation == "empty":
        profile["messages"]["choose_staff"] = ""
    elif mutation == "no_space":
        profile.pop("space")
    else:
        profile["staff"]["accusative"] = "<b>Master</b>"
    with pytest.raises(ValidationError):
        terms.PresetFile.model_validate(payload)


def test_preset_files_are_exactly_the_known_locales():
    on_disk = {path.stem for path in terms.ROOT.glob("*.json")} - {"schema"}
    assert on_disk == set(terms.LOCALES)


def test_published_schema_matches_the_model():
    """schema.json — витрина контракта. Она не читается кодом, поэтому отстать
    может молча: тест — единственное, что это заметит."""
    published = json.loads((terms.ROOT / "schema.json").read_text(encoding="utf-8"))
    assert published == terms.PresetFile.model_json_schema()
