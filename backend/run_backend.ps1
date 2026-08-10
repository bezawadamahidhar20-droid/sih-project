# Launches the MediScan backend as a detached Windows process.
# Poll http://127.0.0.1:8000/api/v1/health to verify.
$ErrorActionPreference = "Stop"
$py = "C:\sihproject\backend\.venv\Scripts\python.exe"
$args = @(
    "-m", "uvicorn", "app.main:app",
    "--host", "127.0.0.1",
    "--port", "8000"
)
$p = Start-Process -FilePath $py `
    -ArgumentList $args `
    -WorkingDirectory "C:\sihproject\backend" `
    -RedirectStandardOutput "C:\sihproject\backend\backend_out.log" `
    -RedirectStandardError "C:\sihproject\backend\backend_err.log" `
    -WindowStyle Hidden -PassThru
Write-Output ("PID=" + $p.Id)
