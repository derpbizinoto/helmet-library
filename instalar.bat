@echo off
setlocal
title Instalador - Helmet Library

tasklist /FI "IMAGENAME eq Adobe Premiere Pro.exe" 2>nul | find /I "Adobe Premiere Pro.exe" >nul
if not errorlevel 1 (
    echo O Premiere esta aberto. Feche o Premiere e rode o instalador de novo.
    echo.
    pause
    exit /b 1
)

set "SRC=%~dp0premiere-helmet-library"
set "DEST=%APPDATA%\Adobe\CEP\extensions\premiere-helmet-library"

if not exist "%SRC%\CSXS\manifest.xml" (
    echo Nao achei a pasta premiere-helmet-library ao lado deste instalador.
    pause
    exit /b 1
)

echo Copiando a extensao para:
echo   %DEST%
if exist "%DEST%" rmdir /s /q "%DEST%"
xcopy "%SRC%" "%DEST%\" /E /I /Y /Q >nul
if errorlevel 1 (
    echo Falha ao copiar os arquivos.
    pause
    exit /b 1
)

echo Liberando extensoes nao assinadas (PlayerDebugMode)...
for %%v in (9 10 11 12 13 14 15 16) do (
    reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
)

echo.
echo Pronto! Abra o Premiere e va em: Janela ^> Extensoes ^> Helmet Library
echo (Window ^> Extensions ^> Helmet Library no Premiere em ingles)
echo.
echo Suas bibliotecas e configuracoes ficam em %%APPDATA%%\Helmet Library
echo e nao sao apagadas ao reinstalar.
echo.
pause
