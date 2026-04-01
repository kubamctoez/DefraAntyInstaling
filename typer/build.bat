@echo off
set CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
    echo Nie znaleziono csc.exe!
    pause
    exit
)
"%CSC%" /out:DefraKlawiatura31.exe /win32manifest:app.manifest typer.cs
echo Build complete!
pause
