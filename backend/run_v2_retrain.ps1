$ErrorActionPreference = "Stop"
$env:OMP_NUM_THREADS = "12"
$env:MKL_NUM_THREADS = "12"
$py = "C:\sihproject\backend\.venv\Scripts\python.exe"
$args = @(
    "-u",
    "-m", "app.models.train",
    "--data-dir", "./data/chest_xray",
    "--arch", "resnet50",
    "--epochs", "10",
    "--batch-size", "16",
    "--lr", "1e-4",
    "--patience", "3",
    "--positive-class", "PNEUMONIA",
    "--selection-metric", "balanced_accuracy",
    "--max-train-samples", "1600",
    "--class-weights", "auto",
    "--output", "./models/model_v2.pth"
)
$p = Start-Process -FilePath $py `
    -ArgumentList $args `
    -WorkingDirectory "C:\sihproject\backend" `
    -RedirectStandardOutput "C:\sihproject\backend\models\v2_retrain.log" `
    -RedirectStandardError "C:\sihproject\backend\models\v2_retrain_err.log" `
    -WindowStyle Hidden -PassThru
Write-Output ("PID=" + $p.Id)
