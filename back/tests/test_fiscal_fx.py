from datetime import date
import pytest
from services.billing_document_fx import FXUnavailable, parse_cnb_rates

def rates(day, rate='24.465', amount='1'):
    return f'{day} #189\nCountry|Currency|Amount|Code|Rate\nEMU|euro|{amount}|EUR|{rate}\n'

@pytest.mark.parametrize('tax_date,published', [
    (date(2026,10,2),'02 Oct 2026'), (date(2026,10,3),'02 Oct 2026'),
    (date(2026,9,28),'25 Sep 2026'), (date(2026,4,6),'02 Apr 2026'),
])
def test_actual_rate_date_and_holiday_validity_are_preserved(tax_date,published):
    found = parse_cnb_rates(rates(published), tax_date)
    assert found['rate'] == '24.465'
    assert found['currency'] == 'EUR'
    assert found['source'] == 'CNB'

@pytest.mark.parametrize('text', [
    rates('01 Oct 2026'), rates('05 Oct 2026'), rates('02 Oct 2026','0'),
    rates('02 Oct 2026','-24'), rates('02 Oct 2026','nan'),
    rates('02 Oct 2026',amount='0'), rates('02 Oct 2026')+'EMU|euro|1|EUR|24.5\n',
    'not a rate table',
])
def test_missing_todays_rate_or_invalid_source_never_invents_a_conversion(text):
    with pytest.raises(FXUnavailable):
        parse_cnb_rates(text,date(2026,10,2))
