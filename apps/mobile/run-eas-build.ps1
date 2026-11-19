Set-Location "D:\programming\New_project\apps\mobile"
$env:EAS_NO_VCS = "1"
$env:EAS_PROJECT_ROOT = "D:\programming\New_project"
$env:Path = "C:\Program Files\Git\cmd;" + $env:Path
npx eas-cli build -p android --profile preview --non-interactive --json
