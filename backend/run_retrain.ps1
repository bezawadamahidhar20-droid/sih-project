# Launches the CPU retrain as a detached Windows process so it survives
# the invoking shell session. Poll models/retrain.log for progress.
$ErrorActionPreference = "Stop"
$env:OMP_NUM_THREADS = "10"
$env:MKL_NUM_THREADS = "10"
$py = "C:\sihproject\backend\.venv\Scripts\python.exe"
$args = @(
    "-u",
    "-m", "app.models.train",
    "--data-dir", "./data/chest_xray",
    "--arch", "resnet50",
    "--epochs", "6",
    "--batch-size", "16",
    "--lr", "1e-4",
    "--patience", "3",
    "--positive-class", "PNEUMONIA",
    "--max-train-samples", "800",
    "--class-weights", "auto",
    "--output", "./models/model_retrain.pth"
)
$p = Start-Process -FilePath $py `
    -ArgumentList $args `
    -WorkingDirectory "C:\sihproject\backend" `
    -RedirectStandardOutput "C:\sihproject\backend\models\retrain.log" `
    -RedirectStandardError "C:\sihproject\backend\models\retrain_err.log" `
    -WindowStyle Hidden -PassThru
Write-Output ("PID=" + $p.Id)
