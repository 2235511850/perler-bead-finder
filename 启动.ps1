# 一键启动本地静态服务器（双击运行）
# 用 Python 内置 http.server，浏览器访问 http://localhost:8000

$port = 8000
$root = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  拼豆找色助手 - 本地服务器" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  打开浏览器访问：" -ForegroundColor Green
Write-Host "    http://localhost:$port/" -ForegroundColor Yellow
Write-Host ""
Write-Host "  按 Ctrl+C 停止服务" -ForegroundColor Gray
Write-Host ""

# 优先用 python -m http.server
$python = (Get-Command python -ErrorAction SilentlyContinue)
if ($python) {
  Start-Process "http://localhost:$port/"
  & python -m http.server $port
  exit
}

# 退而用 py 启动器
$py = (Get-Command py -ErrorAction SilentlyContinue)
if ($py) {
  Start-Process "http://localhost:$port/"
  & py -m http.server $port
  exit
}

Write-Host "未找到 Python，请安装 Python 或使用其他方式启动本地服务器。" -ForegroundColor Red
Write-Host "也可以直接双击 index.html 在 file:// 协议下打开（数据仅存内存）。" -ForegroundColor Yellow
Read-Host "按回车键退出"