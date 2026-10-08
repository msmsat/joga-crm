"""Studio appearance for Connect checkout, independent of Velora billing."""
import ipaddress
import os
import re
from urllib.parse import urljoin, urlsplit

from sqlalchemy import select
from models import Studio, StudioBookingSettings

# Checkout's supported locales (Stripe 15.x); unsupported languages use the
# browser's locale instead of rejecting the entire payment request.
_LOCALES = set('auto bg cs da de el en en-GB es es-419 et fi fil fr fr-CA hr hu id it ja ko lt lv ms mt nb nl pl pt pt-BR ro ru sk sl sv th tr vi zh zh-HK zh-TW'.split())


def _logo_url(value: str | None) -> str | None:
    if not value:
        return None
    if value.startswith('/') and not value.startswith('//'):
        value = urljoin(os.getenv('BACKEND_URL', '').rstrip('/') + '/', value)
    try:
        url = urlsplit(value)
        host = (url.hostname or '').lower()
        if (url.scheme != 'https' or not host or url.username or url.password
                or url.port not in (None, 443) or host == 'localhost'
                or host.endswith(('.localhost', '.local', '.internal'))):
            return None
        try:
            if not ipaddress.ip_address(host).is_global:
                return None
        except ValueError:
            if '.' not in host:
                return None
        # Only formats accepted for Stripe branding; SVG/uploads on localhost
        # are omitted so a local preview still produces a valid Checkout request.
        if not url.path.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
            return None
    except ValueError:
        return None
    return value


def appearance(studio, settings=None) -> dict:
    accent = getattr(settings, 'widget_accent_color', '') or ''
    brand = {
        'display_name': (getattr(studio, 'name', '') or 'Studio').strip()[:150] or 'Studio',
        'background_color': '#121212' if getattr(settings, 'widget_dark_mode', False) else '#FDFCFB',
        'button_color': accent if re.fullmatch(r'#[0-9a-fA-F]{6}', accent) else '#FCAE91',
        'font_family': 'inter',
        'border_style': 'rounded',
    }
    logo = _logo_url(getattr(settings, 'widget_logo_url', None) or getattr(studio, 'logo_url', None))
    if logo:
        brand['logo'] = {'type': 'url', 'url': logo}
    locale = getattr(settings, 'widget_language', 'auto')
    return {'branding_settings': brand, 'locale': locale if locale in _LOCALES else 'auto'}


async def for_studio(db, studio_id: int) -> dict:
    studio = await db.get(Studio, studio_id)
    settings = (await db.execute(select(StudioBookingSettings).where(
        StudioBookingSettings.studio_id == studio_id,
    ))).scalar_one_or_none()
    return appearance(studio, settings)
