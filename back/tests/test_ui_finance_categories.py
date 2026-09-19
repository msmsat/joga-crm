"""UI translations must preserve the server's financial category identifiers."""
import json
from pathlib import Path

import pytest

from services.platform_fee import REFUND_CATEGORY, is_refund_category

LOCALES = Path(__file__).resolve().parents[2] / 'front' / 'src' / 'locales'


@pytest.mark.parametrize('locale', sorted(p.name for p in LOCALES.iterdir() if p.is_dir()))
def test_every_ui_locale_preserves_financial_categories_and_refunds(locale):
    def presets(language):
        return json.loads((LOCALES / language / 'finances.json').read_text(encoding='utf-8'))['operations']['categoryPresets']

    source, target = presets('en'), presets(locale)
    for direction in ('in', 'out'):
        assert [p['value'] for p in target[direction]] == [p['value'] for p in source[direction]]
    refund_index = next(i for i, p in enumerate(source['out']) if p['value'] == REFUND_CATEGORY)
    assert is_refund_category(target['out'][refund_index]['value'])
