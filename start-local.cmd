@echo off
rem Double-click to run the predictor and the website on this computer (see scripts\start_local.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start_local.ps1" %*
