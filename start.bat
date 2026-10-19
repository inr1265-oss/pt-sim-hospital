@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "server\config.json" copy "server\config.example.json" "server\config.json" >nul
echo 브라우저가 열리지 않으면 http://localhost:8787 로 접속하세요.
start "" "http://localhost:8787"
node server\server.js
pause