# Локализация CRM на 22 языка — передача работы

Продолжаем перевод интерфейса CRM (`front/`) на 22 языка. Мини-приложение и
письма бэкенда — НЕ в этой задаче.

## Что уже сделано

Каркас готов и собирается (`npm run build` зелёный):

- `front/src/i18n.ts` — словари подхватываются через `import.meta.glob` по папкам
  `src/locales/<язык>/<неймспейс>.json`. Новый язык = новая папка, файл не трогаем.
- `front/src/components/UI.tsx` → `LANGUAGES` — 22 языка (коды ISO 639-1),
  используется в онбординге, «Настройки → Основные» и «Настройки → Внешний вид».
- `back/schemas/settings/general.py` → `Language` принимает все 22 кода
  (плюс `kz`/`ar` для обратной совместимости со старыми записями).
- `front/src/lib/format.ts` и даты в Billing/Integrations — берут `i18n.language`
  напрямую, без карты `ru→ru-RU`.

Переведено 8 неймспейсов из 18 на все 20 новых языков + часть остальных.
Точный остаток смотри командой ниже.

## Инструменты (в репозитории)

```bash
cd front
python scripts/i18n/verify.py                 # проверить все локали (= npm run check:i18n)
python scripts/i18n/dump.py <ns> [<ns>...]    # выгрузить en как TSV «ключ<TAB>значение»
python scripts/i18n/build.py <ns> <файл.tsv>  # собрать локали из TSV
```

Формат TSV для `build.py` — блоки по языкам:

```
== cs
page.title	Váš profil
page.sub	Spravujte osobní údaje a relace
== pl
page.title	Twój profil
...
```

`build.py` сам строит вложенную структуру по форме `en` и **падает**, если
набор ключей не совпал или подстановки (`{{name}}`, `<0>`, `$t()`) не такие,
как в оригинале. Порядок ключей — как в `en`.

Перевод строки внутри значения в TSV пишется как `\n` — иначе значение разъедется
на несколько строк и `build.py` примет хвост за отдельные ключи. `dump.py`
экранирует его сам. Такое значение в продукте одно — `billing mode.termsMessage`.

## Что осталось

```bash
cd front && python -c "
import sys,os; sys.path.insert(0,'scripts/i18n')
import lib
langs=[d for d in sorted(os.listdir(lib.SRC)) if os.path.isdir(f'{lib.SRC}/{d}') and d not in ('en','ru')]
for n in lib.namespaces():
    have=[l for l in langs if os.path.exists(f'{lib.SRC}/{l}/{n}.json')]
    if len(have)<len(langs):
        print(n, len(lib.flatten(lib.load('en',n))), 'ключей —', f'{len(have)}/{len(langs)}',
              'нет:', [l for l in langs if l not in have])
"
```

Порядок работы: берёшь неймспейс → `dump.py` → пишешь TSV сразу на несколько
языков → `build.py` → следующий. Батчи бери крупные (1000–1500 строк за раз),
иначе это тянется бесконечно.

## Языки

`en ru sq bg hr cs da fi fr de el hu it no pl pt ro sr es sv tr uk`

## Множественное число — важно

`scripts/i18n/lib.py` → `PLURAL_FORMS` знает, какие категории CLDR нужны каждому
языку. Для ключей вида `count_one` / `count_other` в `en` славянским языкам
надо дописывать `_few` / `_many`, иначе i18next свалится на английский:

- `cs hr sr ro` → `one`, `few`, `other`
- `pl uk` → `one`, `few`, `many`
- остальные → `one`, `other`

Исключение: если рядом есть **голый** ключ без суффикса (`today.subtitle`), он
работает как catch-all — замерено на i18next 26, лишние категории не нужны.

## Хвосты, которые ещё не сделаны

1. **`cz` → `cs`.** Владелец согласовал миграцию. Сейчас код чешского в
   мини-приложении и в `front/src/pages/dashboard/Booking/mapping.ts`
   (`LANG_OPTS`, ключ локали `options.lang.cz`) — нестандартный `cz`.
   Переименовать в `cs`, добавить маппинг старого значения при чтении
   `localStorage` и `booking_settings.widget_language`, чтобы у текущих студий
   ничего не слетело.
2. **`back/services/ai_uimap.md`** — если менялись подписи кнопок, прогнать
   `npm run check:uimap`.
3. **Размер бандла.** Сейчас все словари грузятся `eager` — на 22 языках это
   ~+1 МБ. Померить `npm run build` в конце; если больно, перевести `i18n.ts`
   на ленивую загрузку (`import.meta.glob` без `eager` + `addResourceBundle`),
   оставив `en` в бандле как fallback.

## Проверка перед сдачей

```bash
cd front && npm run check:i18n && npm run build && npm run lint
```
