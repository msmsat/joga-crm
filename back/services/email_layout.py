"""Единая вёрстка исходящих писем и ссылки «открыть нужный раздел».

Раньше каждое письмо собиралось само: notifier отдавал голый `<p>текст</p>`,
otp — `<p>код</p>`, и только приглашение (services/invites.py) было свёрстано
по-человечески. Здесь эта вёрстка вынесена в одно место, а `mailer.send_email`
оборачивает в неё ЛЮБОЕ письмо — поэтому места отправки менять не пришлось:
письмо, собранное как фрагмент, приезжает в оболочку само.

Вёрстка таблицами и инлайновыми стилями — не наследие, а требование почтовиков:
Gmail и Outlook вырезают `<style>` и не понимают flex/grid, внешние картинки
режут по умолчанию (поэтому логотип — текстом, акцент — фоном ячейки).

Ссылка ведёт не «в приложение», а в КОНКРЕТНЫЙ раздел:
  - клиентские события (c*) — во вкладку клиентского мини-приложения
    (`MINIAPP_URL/s/<studio>?tab=my`, вкладки из miniapp/src/components/navItems.tsx);
  - события команды (t*/a*/o*) — на страницу CRM (`WEB_APP_URL/dashboard/...`).
Событие без записи в карте просто остаётся без кнопки — это нормально, кнопка
«куда-нибудь» хуже её отсутствия.

Self-check:  python -m services.email_layout
"""
import json
import os
import re
from datetime import datetime, timedelta
from html import escape, unescape
from urllib.parse import quote

from dotenv import load_dotenv

from services.i18n import pick, resolve

load_dotenv()

WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:5173").rstrip("/")
MINIAPP_URL = os.getenv("MINIAPP_URL", "http://localhost:5174").rstrip("/")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")

# Метка «письмо уже в оболочке»: send_email оборачивает всё подряд, и без неё
# готовый документ обернулся бы второй раз.
MARK = "<!--velora-mail-->"

ACCENT = "#F9A08B"
ACCENT_LIGHT = "#FCAE91"
INK = "#1A1A1A"
BODY = "#666666"
MUTED = "#999999"
PAPER = "#FDFCFB"
FONT = "'Manrope','Segoe UI',Arial,sans-serif"


# ─── БЛОКИ ────────────────────────────────────────────────────────────────────

def button(label: str, url: str) -> str:
    """Кнопка-ссылка. Таблицей, а не `<a>` с padding: Outlook игнорирует
    паддинги на инлайновых элементах и кнопка схлопывается в текст."""
    return (
        '<table cellpadding="0" cellspacing="0" style="margin:26px 0 4px"><tr>'
        f'<td align="center" style="background:{ACCENT};border-radius:12px">'
        f'<a href="{url}" style="display:inline-block;padding:15px 32px;font:700 15px {FONT};'
        f'color:#FFFFFF;text-decoration:none">{label}</a>'
        '</td></tr></table>'
    )


_GREETING = {
    "ru": "{name}, здравствуйте!",
    "en": "Hi {name}!",
    "uk": "{name}, вітаємо!",
    "cs": "Dobrý den, {name}!",
    "de": "Hallo {name}!",
}


def greeting(name: str | None, lang: str = "ru") -> str | None:
    """«Матвей, здравствуйте!» — только если имя есть и это имя, а не заглушка.

    Обращение «, здравствуйте!» без имени выдаёт машину вернее, чем его
    отсутствие. Берём первое слово: в поле имени часто лежит «Матвей Садовский»,
    а по фамилии в письме не обращаются.
    """
    first = (name or "").strip().split(" ")[0]
    if not first or "@" in first:  # почта вместо имени — у клиента без карточки
        return None
    return pick(_GREETING, lang).format(name=first)


def link(label: str, url: str) -> str:
    """Ссылка внутри текста — для второстепенного перехода рядом с кнопкой."""
    return f'<a href="{url}" style="color:{ACCENT};font-weight:700;text-decoration:none">{label}</a>'


def code_block(code: str) -> str:
    """Код подтверждения крупно и вразрядку — его переписывают руками, а не читают."""
    return (
        f'<table width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 6px">'
        f'<tr><td align="center" style="background:{PAPER};border:1px solid rgba(26,26,26,0.06);'
        f'border-radius:14px;padding:20px 16px">'
        f'<div style="font:800 32px {FONT};letter-spacing:8px;color:{INK}"><b>{code}</b></div>'
        f'</td></tr></table>'
    )


def facts(rows: list[tuple[str, str]]) -> str:
    """«Детали» — карточка «поле → значение»: занятие, время, тренер, зал, сумма.

    Одна строка текста отвечает «что случилось», но не «какое именно занятие, во
    сколько и с кем» — а именно это человек ищет в письме глазами. Пустые
    значения вызывающий не передаёт: строка «Тренер: —» хуже её отсутствия.
    """
    if not rows:
        return ""
    cells = "".join(
        f'<tr><td style="padding:11px 20px;font:400 13px {FONT};color:{MUTED};white-space:nowrap'
        f'{";border-top:1px solid #F0EDE8" if i else ""}">{escape(str(k))}</td>'
        f'<td align="right" style="padding:11px 20px;font:700 14px {FONT};color:{INK}'
        f'{";border-top:1px solid #F0EDE8" if i else ""}">{escape(str(v))}</td></tr>'
        for i, (k, v) in enumerate(rows)
    )
    return (
        f'<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;background:{PAPER};'
        f'border:1px solid rgba(26,26,26,0.06);border-radius:14px">{cells}</table>'
    )


def maps_url(address: str) -> str:
    """Ссылка на карту по адресу. Google Maps, а не «наша» страница: маршрут
    строит телефон, и лишний переход между ними — потерянный клиент у двери."""
    return f"https://www.google.com/maps/search/?api=1&query={quote(address)}"


_MAP_LINK = {
    "ru": "Посмотреть на карте", "en": "View on the map", "uk": "Подивитися на карті",
    "cs": "Zobrazit na mapě", "de": "Auf der Karte ansehen",
}


def studio_card(
    name: str, address: str | None = None, phone: str | None = None,
    email: str | None = None, lang: str = "ru",
) -> str:
    """Подпись студии: адрес с картой, телефон и почта — кликабельные.

    Это письмо ОТ студии, и на нём должно быть видно, от кого именно и как с ней
    связаться, не возвращаясь в поиск. `tel:`/`mailto:` — чтобы с телефона
    звонок был одним касанием, а не выделением номера.
    """
    line = " · ".join(filter(None, [
        f'<a href="tel:{phone.replace(" ", "")}" style="color:{BODY};text-decoration:none">{escape(phone)}</a>'
        if phone else "",
        f'<a href="mailto:{email}" style="color:{BODY};text-decoration:none">{escape(email)}</a>'
        if email else "",
    ]))
    route = (
        f'<div style="margin-top:10px">{link(pick(_MAP_LINK, lang), maps_url(address))}</div>'
        if address else ""
    )
    return (
        f'<table width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0">'
        f'<tr><td style="padding-top:20px;border-top:1px solid #F0EDE8">'
        f'<div style="font:700 15px {FONT};color:{INK}">{escape(name)}</div>'
        + (f'<div style="margin-top:4px;font:400 13px/1.6 {FONT};color:{BODY}">{escape(address)}</div>' if address else "")
        + (f'<div style="margin-top:4px;font:400 13px/1.6 {FONT};color:{BODY}">{line}</div>' if line else "")
        + route +
        f'</td></tr></table>'
    )


# ─── КАЛЕНДАРЬ ────────────────────────────────────────────────────────────────

def _ics_escape(value: str) -> str:
    """RFC 5545: запятая, точка с запятой и перенос строки — управляющие."""
    return value.replace("\\", "\\\\").replace(";", r"\;").replace(",", r"\,").replace("\n", r"\n")


def calendar_ics(
    *, uid: str, summary: str, start: datetime, minutes: int = 60,
    location: str = "", description: str = "", tz: str | None = None,
    cancelled: bool = False,
) -> bytes:
    """Файл .ics с занятием — вложением к письму.

    Зачем вложение, а не только разметка для Gmail (ld_json ниже): карточку с
    маршрутом рисует Gmail, а .ics кладут в календарь ВСЕ клиенты — Apple Mail,
    Outlook, Thunderbird. Один файл закрывает всех, включая тех, кто письмо
    вообще не разбирает.

    cancelled=True — та же встреча со STATUS:CANCELLED и SEQUENCE:1: календарь
    получателя вычёркивает занятие сам, а не оставляет мёртвую запись после
    отмены. Поэтому uid обязан совпадать с uid подтверждения — он строится по
    id занятия (см. notifier._calendar_for).

    ponytail: TZID без VTIMEZONE-блока — Apple/Google/Outlook разбирают
    олсоновское имя сами; полноценный VTIMEZONE нужен только древним клиентам.
    """
    stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    fmt = "%Y%m%dT%H%M%S"
    when = f";TZID={tz}:" if tz else ":"
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Velora//CRM//RU",
        "CALSCALE:GREGORIAN", "METHOD:CANCEL" if cancelled else "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{stamp}",
        f"SEQUENCE:{1 if cancelled else 0}",
        f"STATUS:{'CANCELLED' if cancelled else 'CONFIRMED'}",
        f"DTSTART{when}{start.strftime(fmt)}",
        f"DTEND{when}{(start + timedelta(minutes=minutes or 60)).strftime(fmt)}",
        f"SUMMARY:{_ics_escape(summary)}",
    ]
    if location:
        lines.append(f"LOCATION:{_ics_escape(location)}")
    if description:
        lines.append(f"DESCRIPTION:{_ics_escape(description)}")
    # Напоминание за час средствами самого календаря — оно сработает и там, где
    # наше письмо-напоминание не дойдёт (отключён канал, папка «Промоакции»).
    if not cancelled:
        lines += ["BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY",
                  f"DESCRIPTION:{_ics_escape(summary)}", "END:VALARM"]
    lines += ["END:VEVENT", "END:VCALENDAR"]
    # CRLF — по RFC; на LF спотыкается Outlook.
    return ("\r\n".join(lines) + "\r\n").encode("utf-8")


def ld_json(
    *, summary: str, start: datetime, minutes: int, place: str, address: str, url: str,
) -> str:
    """schema.org-разметка брони — из неё Gmail рисует карточку события над
    письмом: дата, кнопка «в календарь» и маршрут до студии. Ровно то, чем
    заметны письма крупных сервисов; клиенты, которые разметку не понимают,
    просто её не видят (script в теле письма не отображается)."""
    data = {
        "@context": "http://schema.org",
        "@type": "EventReservation",
        "reservationStatus": "http://schema.org/ReservationConfirmed",
        "reservationFor": {
            "@type": "Event",
            "name": summary,
            "startDate": start.isoformat(),
            "endDate": (start + timedelta(minutes=minutes or 60)).isoformat(),
            "location": {
                "@type": "Place",
                "name": place,
                "address": address or place,
            },
        },
        "url": url,
    }
    return f'<script type="application/ld+json">{json.dumps(data, ensure_ascii=False)}</script>'


# ─── ССЫЛКА В НУЖНЫЙ РАЗДЕЛ ───────────────────────────────────────────────────

# Вкладки клиентского мини-приложения (miniapp/src/components/navItems.tsx).
_CLIENT_TAB = {
    "c1": "my", "c2": "my", "c3": "sched", "c4": "prof", "c5": "prof",
    "c6": "prof", "c7": "sched", "c8": "my", "c9": "prof", "c11": "my",
    # c10 «Занятие не оплачено» ведёт в «Мои записи»: там у неоплаченного
    # занятия стоит плашка с суммой — человек видит, о каком визите речь.
    "c10": "my",
    "c12": "club", "c13": "my",
}

# Подписи кнопки — на всех языках, на которых говорит продукт (services/i18n).
# Одни и те же для письма и для кнопки шаблона WhatsApp: адрес у них общий, и
# расходиться подписи не должны.
# Подпись обязана влезать в 25 символов: столько Meta даёт кнопке шаблона.
_TAB_LABEL = {
    "my": {"ru": "Мои записи", "en": "My bookings", "uk": "Мої записи",
           "cs": "Moje rezervace", "de": "Meine Buchungen"},
    "sched": {"ru": "Расписание", "en": "Schedule", "uk": "Розклад",
              "cs": "Rozvrh", "de": "Kursplan"},
    "prof": {"ru": "Мой абонемент", "en": "My subscription", "uk": "Мій абонемент",
             "cs": "Moje permanentka", "de": "Mein Abo"},
    "club": {"ru": "Клуб и бонусы", "en": "Club and bonuses", "uk": "Клуб і бонуси",
             "cs": "Klub a bonusy", "de": "Club und Bonus"},
    "home": {"ru": "Открыть приложение", "en": "Open the app", "uk": "Відкрити застосунок",
             "cs": "Otevřít aplikaci", "de": "App öffnen"},
}

# Страницы CRM (front/src/App.tsx, ветка /dashboard).
_CRM_PAGE = {
    "t1": "journal", "t2": "journal", "t3": "journal", "t4": "journal",
    "t5": "journal", "t9": "journal", "a1": "journal", "a2": "journal",
    "a7": "journal",
    "t7": "clients", "t8": "clients", "a3": "clients", "a6": "clients",
    "t6": "finances", "a4": "finances", "a10": "finances", "o3": "finances",
    "o8": "finances",
    "a8": "reports", "o1": "reports", "o2": "reports", "o4": "reports",
    "o5": "staff", "o7": "staff",
    "a9": "settings", "o9": "settings",
    "o6": "billing",
}

# Названия разделов CRM — из словарей интерфейса (front/src/locales/<язык>/menu.json,
# ключи nav.*), чтобы кнопка называла раздел ровно так, как он подписан в меню.
_PAGE_LABEL = {
    "journal": {"ru": "Открыть журнал", "en": "Open the journal", "uk": "Відкрити журнал",
                "cs": "Otevřít deník", "de": "Journal öffnen"},
    "clients": {"ru": "Открыть клиентов", "en": "Open clients", "uk": "Відкрити клієнтів",
                "cs": "Otevřít klienty", "de": "Kunden öffnen"},
    "finances": {"ru": "Открыть финансы", "en": "Open finances", "uk": "Відкрити фінанси",
                 "cs": "Otevřít finance", "de": "Finanzen öffnen"},
    "reports": {"ru": "Открыть отчёты", "en": "Open reports", "uk": "Відкрити звіти",
                "cs": "Otevřít reporty", "de": "Berichte öffnen"},
    "staff": {"ru": "Открыть сотрудников", "en": "Open staff", "uk": "Відкрити команду",
              "cs": "Otevřít zaměstnance", "de": "Mitarbeiter öffnen"},
    "settings": {"ru": "Открыть настройки", "en": "Open settings", "uk": "Відкрити налаштування",
                 "cs": "Otevřít nastavení", "de": "Einstellungen öffnen"},
    "billing": {"ru": "Тариф и оплата", "en": "Open billing", "uk": "Тариф і оплата",
                "cs": "Tarif a platba", "de": "Tarif und Zahlung"},
}


def section_url(event_id: str, studio_id: int) -> str | None:
    """Адрес раздела, о котором письмо. None — для события раздела нет."""
    tab = _CLIENT_TAB.get(event_id)
    if tab:
        return f"{MINIAPP_URL}/s/{studio_id}?tab={tab}"
    page = _CRM_PAGE.get(event_id)
    return f"{WEB_APP_URL}/dashboard/{page}" if page else None


def section_label(event_id: str, lang: str = "ru") -> str | None:
    """Подпись кнопки «открыть раздел» на языке получателя. None — раздела нет.

    Одна на письмо и на кнопку шаблона WhatsApp: адрес у них общий (section_url),
    и подпись расходиться не должна — человек, получивший одно и то же событие в
    двух каналах, не должен гадать, ведут ли кнопки в разные места.
    """
    tab = _CLIENT_TAB.get(event_id)
    labels = _TAB_LABEL.get(tab) if tab else _PAGE_LABEL.get(_CRM_PAGE.get(event_id, ""))
    if labels is None:
        return None
    return labels.get(lang) or labels["en"]


def cta(event_id: str, studio_id: int, lang: str = "ru") -> str:
    """Готовая кнопка «открыть раздел» под событие или "" — если раздела нет."""
    url = section_url(event_id, studio_id)
    label = section_label(event_id, lang)
    if not url or not label:
        return ""
    return button(label, url)


# ─── ОБОЛОЧКА ─────────────────────────────────────────────────────────────────

_FOOTER = {
    "ru": "Письмо отправлено автоматически — отвечать на него не нужно.",
    "en": "This is an automated message — no reply needed.",
    "uk": "Лист надіслано автоматично — відповідати на нього не потрібно.",
    "cs": "Tento e-mail byl odeslán automaticky — neodpovídejte na něj.",
    "de": "Diese E-Mail wurde automatisch versendet — eine Antwort ist nicht nötig.",
}

_LEGAL = {
    "ru": ("Условия использования", "Политика конфиденциальности"),
    "en": ("Terms of Service", "Privacy Policy"),
    "uk": ("Умови використання", "Політика конфіденційності"),
    "cs": ("Podmínky použití", "Zásady ochrany osobních údajů"),
    "de": ("Nutzungsbedingungen", "Datenschutzerklärung"),
}


def wrap(body_html: str, *, title: str | None = None, brand: str = "Velora",
         preheader: str = "", greeting: str | None = None, lang: str | None = None) -> str:
    """Фрагмент письма → цельный документ в стиле продукта.

    `title` (обычно тема письма) becomes заголовком, но только если своего в теле
    нет: у писем биллинга он свой и точнее темы («Оплата получена» против
    «Velora — чек об оплате тарифа»).

    `greeting` — обращение по имени над заголовком. Письмо, начинающееся с
    «Матвей, здравствуйте!», читается как письмо от студии, а не как системная
    рассылка; имя знает только отправляющий слой, поэтому оно параметр.

    Уже обёрнутое письмо возвращается как есть — см. MARK.

    `lang` — язык подвала и юридических ссылок. Не передан — определяем по телу
    письма, но грубо: кириллица считается русским. С появлением украинского это
    перестало быть безобидным (украинское письмо получало русский подвал),
    поэтому места отправки, которые язык знают, передают его явно.
    """
    if MARK in body_html:
        return body_html
    lang = resolve(lang) if lang else ("ru" if re.search("[а-яА-Я]", body_html) else "en")
    heading = ""
    if title and not re.search(r"<h[12]\b", body_html):
        heading = (
            f'<h1 style="margin:0 0 14px;font:800 24px/1.25 {FONT};'
            f'letter-spacing:-0.6px;color:{INK}">{title}</h1>'
        )
    if greeting:
        heading = (
            f'<div style="margin:0 0 6px;font:600 14px {FONT};color:{ACCENT}">{escape(greeting)}</div>'
        ) + heading
    # Юридические ссылки — только под письмами самой платформы. В письме студии
    # своим клиентам условия использования CRM ни при чём.
    legal = ""
    if brand == "Velora":
        terms, privacy = _LEGAL[lang]
        legal = (
            f'<p style="margin:8px 0 0;font:400 11px/1.6 {FONT};color:#BBBBBB">'
            f'<a href="{BACKEND_URL}/static/terms.html" style="color:#BBBBBB">{terms}</a> · '
            f'<a href="{BACKEND_URL}/static/privacy.html" style="color:#BBBBBB">{privacy}</a></p>'
        )
    # Превью в списке писем — первые слова САМОГО письма, а не тема: тема стоит
    # в строке рядом, и повторять её в сниппете значит показать одно и то же
    # дважды вместо того, ради чего письмо открывают («Вы записаны на …»).
    snippet = preheader or " ".join(plain_text(body_html).split())[:110]
    return f"""{MARK}
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{snippet}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background:{PAPER};padding:40px 16px;font-family:{FONT}">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 8px 24px -4px rgba(26,26,26,0.06)">
      <tr><td style="height:4px;background:linear-gradient(90deg,{ACCENT_LIGHT},{ACCENT})"></td></tr>
      <tr><td style="padding:34px 40px 0">
        <div style="font:800 19px {FONT};letter-spacing:-0.4px;color:{INK}">{brand}</div>
      </td></tr>
      <tr><td style="padding:22px 40px 0;font:400 15px/1.65 {FONT};color:{BODY}">
        {heading}{body_html}
      </td></tr>
      <tr><td style="padding:28px 40px 34px">
        <p style="margin:0;padding-top:18px;border-top:1px solid #F0EDE8;font:400 12px/1.6 {FONT};color:{MUTED}">{_FOOTER[lang]}</p>
        {legal}
      </td></tr>
    </table>
  </td></tr>
</table>"""


def plain_text(html: str) -> str:
    """Текстовая версия письма (multipart/alternative). Без неё письмо целиком
    состоит из HTML — спам-фильтры считают это признаком рассылки, а часть
    клиентов (и умные часы) показывают пустоту.

    Это не «HTML без тегов», а вторая версия того же письма, и читаться она
    обязана так же: скрытый сниппет выкинут (иначе первая строка дублируется),
    ячейки деталей соединены двоеточием («Тренер: Анна», а не «ТренерАнна»),
    адреса ссылок выписаны рядом с подписью — в тексте по кнопке не кликнешь.
    """
    text = re.sub(r"(?is)<(script|style|head)[^>]*>.*?</\1>", " ", html)
    # Прехедер невидим в почтовом клиенте и не должен быть видим здесь.
    text = re.sub(r'(?is)<div style="display:none.*?</div>', " ", text)
    # Ссылки: подпись плюс адрес. tel:/mailto: пропускаем — там подпись и есть
    # адрес, и «+420 739 007 750 (tel:+420739007750)» только мусорит.
    text = re.sub(
        r'(?is)<a\b[^>]*href="(https?://[^"]+)"[^>]*>(.*?)</a>',
        lambda m: f"{re.sub(r'<[^>]+>', '', m.group(2)).strip()} ({m.group(1)})",
        text,
    )
    text = re.sub(r"(?is)</td>\s*<td[^>]*>", ": ", text)
    text = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|h[1-6]|table)>", "\n", text)
    text = re.sub(r"(?s)<[^>]+>", "", text)
    text = unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n\s*\n\s*", "\n\n", text).strip()


if __name__ == "__main__":
    doc = wrap("<p>Вы записаны на «Хатха-йога».</p>", title="Запись подтверждена", brand="Йога-студия")
    assert MARK in doc and "Йога-студия" in doc
    assert "Запись подтверждена" in doc and "отвечать на него не нужно" in doc
    assert "static/terms.html" not in doc, "условия платформы в письме студии клиенту"
    assert "static/terms.html" in wrap("<p>Оплата</p>", title="Чек")
    # Идемпотентность: send_email оборачивает всё подряд, включая уже готовое.
    assert wrap(doc, title="Ещё раз") == doc
    # Свой заголовок в теле не дублируется темой письма.
    assert "<h1" not in wrap("<h2>Оплата получена</h2>", title="Velora — чек")
    # Превью в списке писем — начало письма, а не повтор темы рядом с ней.
    assert ">Вы записаны на «Хатха-йога».<" in doc, "сниппет не из текста письма"
    assert ">Запись подтверждена</div>" not in doc
    # Английское тело — английский подвал.
    assert "no reply needed" in wrap("<p>You are booked.</p>", title="Booked")

    # Ссылки ведут в разные приложения: клиент — в мини-приложение, команда — в CRM.
    assert section_url("c1", 42) == f"{MINIAPP_URL}/s/42?tab=my"
    assert section_url("o6", 42) == f"{WEB_APP_URL}/dashboard/billing"
    assert section_url("t7", 1).endswith("/dashboard/clients")
    assert section_url("zzz", 1) is None and cta("zzz", 1) == ""
    assert 'href="' + section_url("c5", 7) + '"' in cta("c5", 7) and "Мой абонемент" in cta("c5", 7)
    assert "My subscription" in cta("c5", 7, "en")

    # Подпись раздела знает все языки продукта; незнакомый язык — английская.
    assert section_label("c5", "cs") == "Moje permanentka"
    assert section_label("o6", "de") == "Tarif und Zahlung"
    assert section_label("c5", "pl") == "My subscription"
    assert section_label("zzz") is None
    # 25 символов — предел подписи кнопки шаблона WhatsApp (whatsapp_templates).
    assert max(len(v) for m in (*_TAB_LABEL.values(), *_PAGE_LABEL.values())
               for v in m.values()) <= 25, "подпись не влезет в кнопку WhatsApp"

    # Карта разделов не должна разъехаться с каталогом событий и с подписями.
    from services.notifier import KNOWN_EVENT_IDS
    assert not (set(_CLIENT_TAB) | set(_CRM_PAGE)) - KNOWN_EVENT_IDS, "раздел для несуществующего события"
    assert not set(_CLIENT_TAB.values()) - set(_TAB_LABEL), "вкладка без подписи"
    assert not set(_CRM_PAGE.values()) - set(_PAGE_LABEL), "страница CRM без подписи"
    assert not set(_CLIENT_TAB) & set(_CRM_PAGE), "событие ведёт сразу в два приложения"

    # Детали — карточка «поле → значение»; пустой список карточку не рисует.
    card = facts([("Тренер", "Анна"), ("Зал", "Зал 2")])
    assert card.count("<tr>") == 2 and "Анна" in card and facts([]) == ""
    assert "&lt;" in facts([("Зал", "<b>")]), "значение из БД не экранировано"

    # Подпись студии: позвонить, написать и доехать — прямо из письма.
    card = studio_card("Лотос", "Прага, Ke Kapslovně 3", "+420 739 007 750", "a@b.cz")
    assert 'href="tel:+420739007750"' in card and 'href="mailto:a@b.cz"' in card
    assert "google.com/maps" in card and "Ke%20Kapslovn" in card
    assert "google.com/maps" not in studio_card("Лотос"), "карта без адреса"

    # Календарь: одна встреча, час по умолчанию, экранирование по RFC 5545.
    ics = calendar_ics(uid="lesson-7@velora", summary="Хатха, у окна",
                       start=datetime(2026, 8, 17, 12, 0), minutes=90,
                       location="Прага; Ke Kapslovně 3", tz="Europe/Prague").decode()
    assert ics.count("BEGIN:VEVENT") == 1 and ics.endswith("END:VCALENDAR\r\n")
    assert "DTSTART;TZID=Europe/Prague:20260817T120000" in ics
    assert "DTEND;TZID=Europe/Prague:20260817T133000" in ics, "длительность не учтена"
    assert r"SUMMARY:Хатха\, у окна" in ics and r"LOCATION:Прага\; Ke" in ics
    assert "TRIGGER:-PT1H" in ics, "напоминание календаря"
    # Отмена — та же встреча по тому же UID, иначе занятие останется висеть.
    off = calendar_ics(uid="lesson-7@velora", summary="Хатха",
                       start=datetime(2026, 8, 17, 12, 0), cancelled=True).decode()
    assert "STATUS:CANCELLED" in off and "SEQUENCE:1" in off and "VALARM" not in off
    assert "UID:lesson-7@velora" in off and "UID:lesson-7@velora" in ics

    # Обращение: имя есть — здороваемся, почта вместо имени — нет.
    assert greeting("Матвей Садовский") == "Матвей, здравствуйте!"
    assert greeting("Matvei", "en") == "Hi Matvei!"
    assert greeting(None) is None and greeting("  ") is None and greeting("a@b.cz") is None

    # Текстовая версия — вторая версия письма, а не HTML без тегов.
    doc = wrap(
        "<p>Вы записаны на «Хатха-йога».</p>"
        + facts([("Тренер", "Анна")]) + button("Мои записи", "https://app.test/s/1?tab=my"),
        title="Запись подтверждена", brand="Йога-студия",
    )
    text = plain_text(doc)
    assert "<" not in text and "«Хатха-йога»" in text
    assert "Тренер: Анна" in text, "ячейки таблицы слиплись"
    assert "Мои записи (https://app.test/s/1?tab=my)" in text, "в тексте по кнопке не кликнешь"
    assert text.count("Вы записаны") == 1, "скрытый сниппет продублировал первую строку"

    print("email_layout self-check ok")
