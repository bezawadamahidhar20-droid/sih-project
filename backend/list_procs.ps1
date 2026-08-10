Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    ForEach-Object {
        $cmd = $_.CommandLine
        if ($cmd.Length -gt 120) { $cmd = $cmd.Substring(0, 120) }
        "{0}`t{1}`t{2}" -f $_.ProcessId, $_.CreationDate, $cmd
    }
