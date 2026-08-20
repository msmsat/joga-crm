from typing import Literal, Optional

from pydantic import EmailStr, Field, field_validator

from schemas._base import BaseSchema

# Три списка ниже 1-в-1 совпадают с components/UI.tsx (CURRENCIES/LANGUAGES/
# TIMEZONES) — тем же онбординг заполняет Studio при регистрации, и Настройки
# должны принимать любое значение, уже выбранное там.
Currency = Literal[
    "RUB", "USD", "EUR", "KZT", "UAH", "GBP", "AED", "TRY",
    "CZK", "PLN", "HUF", "RON", "BGN", "SEK", "NOK", "DKK", "CHF", "ISK", "RSD",
]
# Коды ISO 639-1, 1-в-1 с LANGUAGES во front/src/components/UI.tsx: у каждого
# есть папка перевода во front/src/locales. "kz" и "ar" в списке нет — их не
# переводили и выбрать их больше негде, но они остаются здесь принимаемыми,
# потому что студия могла сохранить их, пока список был декоративным: без них
# у такой студии перестало бы открываться сохранение любых других настроек.
Language = Literal[
    "en", "ru", "sq", "bg", "hr", "cs", "da", "fi", "fr", "de", "el", "hu",
    "it", "no", "pl", "pt", "ro", "sr", "es", "sv", "tr", "uk",
    "kz", "ar",
]
DateFormat = Literal["DD.MM.YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]
FirstDayOfWeek = Literal["monday", "sunday"]
JournalTimeStep = Literal[5, 10, 15, 30, 60]
# Studio.timezone хранится как офсет-строка ('UTC+3'), не IANA-ключ — см.
# services/daily_notify.py:_studio_tz. Список офсетов совпадает с TIMEZONES
# во front/src/components/UI.tsx (тот же, что выбирает онбординг).
Timezone = Literal[
    "UTC-11", "UTC-10", "UTC-9", "UTC-8", "UTC-7", "UTC-6", "UTC-5", "UTC-4",
    "UTC-3", "UTC-2", "UTC-1", "UTC+0", "UTC+1", "UTC+2", "UTC+3", "UTC+4",
    "UTC+5", "UTC+6", "UTC+7", "UTC+8", "UTC+9", "UTC+10", "UTC+11", "UTC+12",
    "UTC+13", "UTC+14",
]


class GeneralRead(BaseSchema):
    """Полный ответ — только владельцу."""
    name: str
    description: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    vat_id: Optional[str] = None
    company_id: Optional[str] = None
    logo_url: Optional[str] = None
    timezone: Optional[str] = None
    language: Optional[str] = None
    currency: Optional[str] = None
    date_format: Optional[str] = None
    first_day_of_week: Optional[str] = None
    journal_time_step: int


class GeneralReadPublic(BaseSchema):
    """Урезанный ответ не-owner (админ/тренер): без контактов и адреса студии."""
    name: str
    logo_url: Optional[str] = None
    timezone: Optional[str] = None
    language: Optional[str] = None
    currency: Optional[str] = None
    date_format: Optional[str] = None
    first_day_of_week: Optional[str] = None
    journal_time_step: int


class GeneralUpdate(BaseSchema):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=500)
    email: Optional[EmailStr] = None
    website: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=300)
    # Адрес по частям — запасной источник местоположения для Stripe Tax, когда
    # счёт студии выставляем мы сами (комиссия, минимальный платёж): ставку VAT
    # определяет страна, а свободного текста `address` для этого мало. Основной
    # источник — профиль плательщика на аккаунте владельца, см. models/studio.py.
    country: Optional[str] = Field(None, min_length=2, max_length=2)
    # Город — часть адреса плательщика на фактуре: Stripe печатает его отдельной
    # строкой, из свободного `address` он туда не попадёт.
    city: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=20)
    # Номер НДС и регистрационный номер компании (DIČ/IČO, USt-IdNr/HRB…) —
    # справочные поля карточки студии, в налоговый путь они не идут: сверить их
    # здесь нечем, а reverse charge включает только номер, прошедший VIES. Такой
    # номер вводится в реквизитах плательщика (PUT /billing/profile).
    vat_id: Optional[str] = Field(None, max_length=50)
    company_id: Optional[str] = Field(None, max_length=30)
    currency: Optional[Currency] = None
    language: Optional[Language] = None
    date_format: Optional[DateFormat] = None
    first_day_of_week: Optional[FirstDayOfWeek] = None
    timezone: Optional[Timezone] = None
    journal_time_step: Optional[JournalTimeStep] = None

    @field_validator("country")
    @classmethod
    def _upper_country(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        # isascii обязателен: str.isalpha() юникодный и пропускает 'СЗ' кириллицей
        # и '中国'. Для кода страны это мусор, который свалится уже внутри Stripe —
        # режем на границе, где ошибка ещё читаема.
        if not (v.isascii() and v.isalpha()):
            raise ValueError("country должен быть кодом ISO-3166-1 alpha-2, например CZ")
        return v.upper()

    @field_validator("vat_id", "company_id")
    @classmethod
    def _strip_vat(cls, v: Optional[str]) -> Optional[str]:
        # Пробелы внутри номера НДС Stripe не принимает, а люди их ставят.
        # Регистрационный номер нормализуем тем же валидатором: его печатают на
        # фактуре, и «123 456 78» с «12345678» должны быть одним реквизитом, а не двумя.
        # Пустая строка после очистки — это «реквизита нет», а не «реквизит пустой»:
        # иначе PATCH {vat_id: ""} уедет в Stripe пустым tax id вместо пропуска поля.
        if v is None:
            return None
        return v.replace(" ", "").upper() or None


# Персональный внешний вид (User.theme/accent_color) — задача 5. Тот же роутер-
# файл, что и /general (отдельный роутер на две ручки не заводим), поэтому и
# схемы рядом, а не в новом файле.
class AppearanceRead(BaseSchema):
    theme: Optional[str] = None
    accent_color: Optional[str] = None
    # null — язык не выбран лично, интерфейс идёт за языком студии.
    language: Optional[str] = None


class AppearanceUpdate(BaseSchema):
    theme: Optional[Literal["light", "dark", "auto"]] = None
    # Личный язык интерфейса — тот же набор, что у языка студии: человек
    # выбирает его из одного и того же списка LANGUAGES.
    language: Optional[Language] = None
    # Валидация цвета обязательна: значение уходит прямо в CSS-переменную/style
    # на фронте — без неё это инъекция в стиль.
    accent_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
