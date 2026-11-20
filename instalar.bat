@echo off
setlocal EnableDelayedExpansion
title Instalador - Helmet Library

rem Observacao para quem for mexer: caminhos com "(x86)" nao podem aparecer com %VAR%
rem dentro de blocos ( ... ): o ")" fecha o bloco antes da hora e o cmd aborta o
rem script. Dentro de blocos, use !VAR! (expansao atrasada).
rem Este arquivo precisa ter fim de linha CRLF (o .gitattributes garante).

echo ============================================
echo   Instalador - Helmet Library
echo ============================================
echo.

tasklist /FI "IMAGENAME eq Adobe Premiere Pro.exe" 2>nul | find /I "Adobe Premiere Pro.exe" >nul
if not errorlevel 1 (
    echo O Premiere esta aberto. Feche o Premiere e rode o instalador de novo.
    goto :fim_erro
)

set "SRC=%~dp0premiere-helmet-library"
set "DEST=%APPDATA%\Adobe\CEP\extensions\premiere-helmet-library"
set "SYSEXT=%ProgramFiles(x86)%\Common Files\Adobe\CEP\extensions"

if not exist "%SRC%\CSXS\manifest.xml" (
    echo Nao achei a pasta premiere-helmet-library ao lado deste instalador.
    goto :fim_erro
)

rem versao, lida do manifest
set "VERSAO="
for /f tokens^=2^ delims^=^" %%a in ('findstr /C:"ExtensionBundleVersion" "%SRC%\CSXS\manifest.xml"') do (
    if not defined VERSAO set "VERSAO=%%a"
)
if defined VERSAO echo Versao: !VERSAO!
echo Origem:  %SRC%
echo Destino: %DEST%
echo.

echo [1/3] Copiando a extensao...
if exist "%DEST%" (
    rmdir /s /q "!DEST!"
    echo       versao anterior apagada
)
xcopy "%SRC%" "%DEST%\" /E /I /Y /Q >nul
if errorlevel 1 (
    echo       FALHA ao copiar os arquivos.
    goto :fim_erro
)
rem O .debug abre uma porta de depuracao (so serve para desenvolvimento).
rem Nunca fica na instalacao de quem usa a extensao.
if exist "%DEST%\.debug" del /f /q "%DEST%\.debug"
set /a ARQUIVOS=0
for /r "%DEST%" %%f in (*) do set /a ARQUIVOS+=1
echo       !ARQUIVOS! arquivos copiados

echo [2/3] Liberando extensoes nao assinadas (PlayerDebugMode, CSXS 9 a 16)...
set "FALHAS="
for %%v in (9 10 11 12 13 14 15 16) do (
    reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
    if errorlevel 1 set "FALHAS=!FALHAS! %%v"
)
if defined FALHAS (
    echo       FALHA ao gravar no registro para CSXS:!FALHAS!
) else (
    echo       ok
)

echo [3/3] Procurando instalacao antiga em Arquivos de Programas...
if exist "%SYSEXT%\premiere-helmet-library" (
    echo       ATENCAO: achei uma copia antiga em:
    echo         !SYSEXT!\premiere-helmet-library
    echo       Apague essa pasta na mao ^(precisa de administrador^) para nao
    echo       ficar com a extensao duplicada ou velha no Premiere.
) else (
    echo       nenhuma encontrada
)

echo.
echo ============================================
echo   Pronto.
echo ============================================
echo.
echo Abra o Premiere e va em: Janela ^> Extensoes ^> Helmet Library
echo (Window ^> Extensions ^> Helmet Library no Premiere em ingles)
echo.
echo Suas bibliotecas e configuracoes ficam em %%APPDATA%%\Helmet Library
echo e nao sao apagadas ao reinstalar.
echo.
echo Pressione qualquer tecla para fechar.
pause >nul
exit /b 0

:fim_erro
echo.
echo A instalacao NAO foi concluida.
echo Pressione qualquer tecla para fechar.
pause >nul
exit /b 1
