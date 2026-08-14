@echo off
rem ===========================================================================
rem  Vo mo cho install-relay.ps1. Chay: bam dup vao file nay.
rem
rem  FILE NAY CO Y CHI DUNG ASCII. cmd.exe doc file .bat bang cach nho vi tri
rem  BYTE roi doc tiep tu do sau moi lenh; mot ky tu UTF-8 nhieu byte lam lech
rem  het cac vi tri do, va ket qua la cmd chay nham nua dong lenh. Ban dau cua
rem  file nay viet tieng Viet co dau va vo dung kieu ay -- lenh bien thanh
rem  'xist', 'ARGET_EXE" >nul'. Moi chu tieng Viet nam ben install-relay.ps1,
rem  noi PowerShell doc UTF-8 dung.
rem
rem  -ExecutionPolicy Bypass: chi ap dung cho dung lan chay nay, khong doi cai
rem  dat cua may. Khong co no thi may nao dat Restricted (mac dinh cua Windows)
rem  se tu choi chay script.
rem ===========================================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-relay.ps1"
if errorlevel 1 (
  echo.
  echo   Installation failed. Read the message above.
  echo.
)
pause
