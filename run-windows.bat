@echo off
REM ---------------------------------------------------------------------------
REM  Auto-Trader launcher for Windows.
REM
REM  Double-click this file. It checks the things that actually go wrong on a
REM  fresh PC — in the order they go wrong — instead of failing with a stack
REM  trace three steps later.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

echo.
echo  Auto-Trader
echo  ===========
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js is not installed, or not on your PATH.
  echo.
  echo      Install the LTS build from https://nodejs.org  then close this
  echo      window and run it again. The installer adds Node to PATH for you;
  echo      an already-open terminal will not pick that up until reopened.
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODEMAJOR=%%v
if %NODEMAJOR% LSS 20 (
  echo  [X] Node %NODEMAJOR% is too old. This needs Node 20 or newer.
  echo      Install the LTS build from https://nodejs.org
  echo.
  pause
  exit /b 1
)
echo  [ok] Node detected.

if not exist "node_modules" (
  echo  [..] First run — installing dependencies. This takes a few minutes.
  call npm install
  if errorlevel 1 (
    echo.
    echo  [X] npm install failed. Scroll up for the reason — it is usually a
    echo      network or proxy problem rather than anything about this app.
    echo.
    pause
    exit /b 1
  )
)
echo  [ok] Dependencies present.

REM A .env saved by Notepad is very often ".env.txt", which looks identical in
REM Explorer with extensions hidden. That silently drops you onto simulated
REM prices, which is the one failure you would not notice.
if exist ".env.txt" (
  echo.
  echo  [!] Found ".env.txt" — Notepad added the extension. Rename it to
  echo      exactly ".env" or your API keys will be ignored and the app will
  echo      run on SIMULATED prices.
  echo.
)

if not exist ".env" (
  echo.
  echo  [!] No .env file, so this will run on SIMULATED data.
  echo      That is fine for looking around. Nothing you see will say
  echo      anything about a real market.
  echo.
  echo      For real prices, create a file called .env next to this script:
  echo         OANDA_API_TOKEN=your_token
  echo         OANDA_ACCOUNT_ID=your_account_id
  echo         OANDA_BASE_URL=https://api-fxpractice.oanda.com
  echo.
) else (
  echo  [ok] .env found.
)

echo.
echo  Starting. Open http://localhost:5000 in your browser.
echo  Close this window to stop the bot.
echo.

set NODE_ENV=development
call npm run dev

echo.
echo  Auto-Trader stopped.
pause
