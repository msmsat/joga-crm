# Локальная разработка одной командой:  .\dev.ps1
# С проверкой оплаты:                   .\dev.ps1 -Stripe
#
# Два окна, потому что HMR Vite и --reload uvicorn должны показывать свой лог отдельно.
# Docker тут намеренно не используется: на Windows он ломает hot-reload обоих.
param([switch]$Stripe)

$root = $PSScriptRoot
$envPath = Join-Path $root 'back\.env'

# ---------------------------------------------------------------------------
# Вебхуки Stripe: только по флагу -Stripe.
#
# Секрет `stripe listen` — свой на КАЖДУЮ сессию (docs.stripe.com/webhooks
# #local-listener), поэтому вписывать его в .env руками бессмысленно: назавтра он
# другой. Забираем его у CLI и подставляем сами — иначе подпись не сойдётся и
# события молча отвалятся с 400, а выглядеть это будет как «оплата не прошла».
#
# Порядок важен: .env правим ДО старта uvicorn, иначе бэкенд поднимется со
# вчерашним секретом.
# ---------------------------------------------------------------------------
if ($Stripe) {
    # Ищем CLI сами. Только на PATH полагаться нельзя: winget дописывает его в
    # переменную ПОЛЬЗОВАТЕЛЯ, а уже запущенные оболочки (терминал VS Code — в
    # первую очередь) читают окружение один раз при старте и о правке не узнают.
    $exe = (Get-Command stripe -ErrorAction SilentlyContinue).Source
    if (-not $exe) {
        $exe = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter 'stripe.exe' `
            -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $exe) {
        Write-Host "Stripe CLI не найден. Поставить: winget install Stripe.StripeCLI" -ForegroundColor Yellow
        return
    }

    # Ключ берём из .env и передаём флагом. Так `stripe login` не нужен вовсе, а
    # заодно исключено обращение не к тому аккаунту: слушаем ровно тот, чьим
    # ключом работает бэкенд.
    $text = [System.IO.File]::ReadAllText($envPath)
    $key = [regex]::Match($text, '(?m)^STRIPE_SECRET_KEY=(.+)$').Groups[1].Value.Trim()
    if (-not $key.StartsWith('sk_test_') -or $key -like '*ВСТАВЬТЕ*') {
        Write-Host "В back\.env нет тестового ключа. Вставьте sk_test_ и pk_test_ из" -ForegroundColor Yellow
        Write-Host "дашборда Stripe (тумблер Test mode -> Developers -> API keys)." -ForegroundColor Yellow
        return
    }

    # Ключ передаём переменной окружения, а НЕ флагом --api-key: аргументы видны в
    # списке процессов любому, кто откроет диспетчер задач. Дочерние окна
    # наследуют окружение этого процесса, поэтому флаг не нужен и ниже.
    [Environment]::SetEnvironmentVariable('STRIPE_API_KEY', $key, 'Process')

    Write-Host "Забираю секрет вебхука у Stripe CLI..." -ForegroundColor Cyan
    $secret = (& $exe listen --print-secret 2>$null | Select-Object -First 1)
    if (-not $secret -or -not $secret.StartsWith('whsec_')) {
        Write-Host "Не получилось получить секрет. Проверьте ключ в back\.env." -ForegroundColor Red
        return
    }

    # Правим только активную строку. Закомментированный резерв боевых ключей ниже
    # по файлу regex не трогает — у него в начале строки решётка.
    $text = [regex]::Replace($text, '(?m)^STRIPE_WEBHOOK_SECRET=.*$', "STRIPE_WEBHOOK_SECRET=$secret")
    # Без BOM: python-dotenv прочитал бы его как часть имени первой переменной.
    [System.IO.File]::WriteAllText($envPath, $text, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "back\.env обновлён." -ForegroundColor Green

    # Оба эндпоинта продукта одной прослушкой: тариф Velora и касса студий (Connect).
    # Секрет у них общий — ровно поэтому STRIPE_BILLING_WEBHOOK_SECRET локально пуст.
    Start-Process powershell -ArgumentList '-NoExit', '-Command', @"
Set-Location '$root'
& '$exe' listen --forward-to localhost:8000/billing/webhook/stripe --forward-connect-to localhost:8000/checkout/webhook/stripe
"@
}

Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\back'; .\venv\Scripts\Activate.ps1; uvicorn main:app --reload"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\front'; npm run dev"
