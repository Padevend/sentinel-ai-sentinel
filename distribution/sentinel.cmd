@echo off
setlocal
node "%~dp0sentinel.mjs" %*
exit /b %errorlevel%
