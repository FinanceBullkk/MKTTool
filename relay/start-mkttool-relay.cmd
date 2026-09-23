@echo off
rem Startup shortcut wrapper. CMD environment names are case-insensitive on Windows.
setlocal DisableDelayedExpansion
set "NODE_OPTIONS="
set "NODE_EXTRA_CA_CERTS="
set "NODE_USE_SYSTEM_CA="
set "NODE_TLS_REJECT_UNAUTHORIZED="
start "" /b "%~dp0MKTTool-Relay.exe"
