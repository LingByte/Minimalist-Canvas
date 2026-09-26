@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" >NUL 2>&1
if errorlevel 1 (
    echo [dev-tauri] failed to init MSVC environment
    exit /b 1
)
cd /d "%~dp0.."
where link
bun run tauri:dev
