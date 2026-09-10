import copy
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


def test_fallback_is_a_complete_language_and_results_do_not_mutate_cache():
    unknown = terms.resolve_terms("not-a-profile", "xx-YY", "resource")
    assert unknown == terms.resolve_terms("generic", "en", "resource")
    assert terms.resolve_terms("fitness", "ru-RU", "event")["locale"] == "ru"
    unknown["staff"]["singular"] = "modified"
    unknown["messages"].clear()
    assert terms.resolve_terms("generic", "en", "resource")["staff"]["singular"] != "modified"
    studio = SimpleNamespace(language="ru", terminology_profile="beauty")
    config = terms.configuration(studio)
    config["profiles"].clear()
    assert set(terms.configuration(studio)["profiles"]) == terms.PROFILES


@pytest.mark.parametrize("mutation", ["missing", "unknown", "html", "interpolation", "empty", "form"])
def test_invalid_presets_fail_validation(mutation):
    payload = copy.deepcopy(terms._load("ru").model_dump())
    profile = payload["profiles"]["generic"]
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
    else:
        profile["staff"]["accusative"] = "<b>Master</b>"
    with pytest.raises(ValidationError):
        terms.PresetFile.model_validate(payload)
