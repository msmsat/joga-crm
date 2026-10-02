"""Dated CNB EUR/CZK fixing; an unavailable fixing leaves issuance pending."""
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
import re

import aiohttp

CNB_URL = 'https://www.cnb.cz/en/financial_markets/foreign_exchange_market/exchange_rate_fixing/daily.txt'
MONTHS = {name: i for i, name in enumerate(
    ('Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'), 1)}
_cache: dict[date, dict] = {}

class FXUnavailable(RuntimeError):
    """Retry later; never issue a document using an invented or stale fixing."""
    pass

def _easter(year: int) -> date:
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19*a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2*e + 2*i - h - k) % 7
    m = (a + 11*h + 22*l) // 451
    month = (h + l - 7*m + 114) // 31
    day = (h + l - 7*m + 114) % 31 + 1
    return date(year, month, day)

def _business_day(day: date) -> bool:
    holidays = {(1,1),(5,1),(5,8),(7,5),(7,6),(9,28),(10,28),(11,17),(12,24),(12,25),(12,26)}
    easter = _easter(day.year)
    return (day.weekday() < 5 and (day.month,day.day) not in holidays
            and day not in (easter-timedelta(days=2), easter+timedelta(days=1)))

def fixing_date(tax_date: date) -> date:
    day = tax_date
    while not _business_day(day):
        day -= timedelta(days=1)
    return day

def parse_cnb_rates(text: str, tax_date: date) -> dict:
    try:
        lines = text.strip().splitlines()
        match = re.fullmatch(r'(\d{2}) ([A-Za-z]{3}) (\d{4}) #\d+', lines[0].strip())
        if not match:
            raise ValueError('Invalid CNB date')
        published = date(int(match[3]), MONTHS[match[2]], int(match[1]))
        if published != fixing_date(tax_date):
            raise ValueError('Fixing for the tax date is not published')
        rows = [line.split('|') for line in lines[2:] if '|EUR|' in line]
        if len(rows) != 1 or len(rows[0]) != 5:
            raise ValueError('EUR fixing is missing or ambiguous')
        amount, raw = Decimal(rows[0][2]), Decimal(rows[0][4])
        if not amount.is_finite() or not raw.is_finite() or amount <= 0 or raw <= 0:
            raise ValueError('Invalid CNB rate')
        rate = raw / amount
        return {'currency':'EUR', 'rate':format(rate,'f'), 'date':published.isoformat(),
                'tax_date':tax_date.isoformat(), 'source':'CNB',
                'source_url':CNB_URL+'?date='+tax_date.strftime('%d.%m.%Y')}
    except (ValueError, IndexError, KeyError, InvalidOperation) as exc:
        raise FXUnavailable('Official CNB fixing for the tax date is unavailable') from exc

async def fetch_cnb_rate(tax_date: date) -> dict:
    if tax_date in _cache:
        return dict(_cache[tax_date])
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8)) as client:
            async with client.get(CNB_URL, params={'date':tax_date.strftime('%d.%m.%Y')}) as response:
                response.raise_for_status()
                found = parse_cnb_rates(await response.text(), tax_date)
    except (aiohttp.ClientError, TimeoutError) as exc:
        raise FXUnavailable('CNB rate service is unavailable; issuance will be retried') from exc
    if len(_cache) >= 64:
        _cache.pop(next(iter(_cache)))
    _cache[tax_date] = found
    return dict(found)
