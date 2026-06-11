@echo off
echo Starting Guardian Mesh Ground Station...

:: Check if virtual environment exists, if so activate it
if exist "venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
) else if exist ".venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call .venv\Scripts\activate.bat
)

:: Start the FastAPI server in the background
echo Starting FastAPI server...
start /b uvicorn main:app --host 127.0.0.1 --port 8000

:: Wait a moment for the server to start
timeout /t 3 /nobreak >nul

:: Open the browser
echo Opening browser...
start http://127.0.0.1:8000

echo Application is running. Close this window to stop the server (you may need to manually kill the Python process).
pause
