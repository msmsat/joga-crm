# Локальная разработка одной командой:  .\dev.ps1
# Два окна, потому что HMR Vite и --reload uvicorn должны показывать свой лог отдельно.
# Docker тут намеренно не используется: на Windows он ломает hot-reload обоих.
$root = $PSScriptRoot
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\back'; .\venv\Scripts\Activate.ps1; uvicorn main:app --reload"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\front'; npm run dev"
