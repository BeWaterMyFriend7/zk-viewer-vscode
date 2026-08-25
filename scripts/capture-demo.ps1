$ErrorActionPreference = 'Stop'

$repository = Split-Path -Parent $PSScriptRoot
$frames = Join-Path $repository 'dist/demo-frames'
$ffmpeg = 'D:/Program Files/EVCapture/ffmpeg.exe'
$cdp = 9222

New-Item -ItemType Directory -Force -Path $frames | Out-Null
Get-ChildItem $frames -File -ErrorAction SilentlyContinue | Remove-Item -Force

function Invoke-AgentBrowser {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & agent-browser --cdp $cdp @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "agent-browser failed: $($Arguments -join ' ')"
  }
}

function Capture-Frame {
  param([string]$Name, [int]$DelayMs = 500)
  Start-Sleep -Milliseconds $DelayMs
  Invoke-AgentBrowser screenshot (Join-Path $frames $Name)
}

function Click-Action {
  param([string]$AriaLabel, [string]$RowAriaLabel = '')
  $labelJson = $AriaLabel.Replace('\', '\\').Replace("'", "\'")
  $rowJson = $RowAriaLabel.Replace('\', '\\').Replace("'", "\'")
  $expression = @"
(() => {
  const rowLabel = '$rowJson';
  const label = '$labelJson';
  const rows = rowLabel ? [...document.querySelectorAll('.monaco-list-row')].filter(row => row.getAttribute('aria-label') === rowLabel) : [document];
  const candidate = rows.flatMap(row => [...row.querySelectorAll('a.action-label[aria-label]')])
    .concat(rowLabel ? [] : [...document.querySelectorAll('a.action-label[aria-label]')])
    .find(element => element.getAttribute('aria-label') === label && element.getBoundingClientRect().width > 0);
  if (!candidate) throw new Error('Action not found: ' + label + (rowLabel ? ' in ' + rowLabel : ''));
  const rect = candidate.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
})()
"@
  $point = (& node (Join-Path $repository 'dist/cdp-eval.js') page $expression) | ConvertFrom-Json
  & node (Join-Path $repository 'dist/cdp-mouse.js') $point.x $point.y left
  if ($LASTEXITCODE -ne 0) { throw "Could not click action: $AriaLabel" }
}

function Open-ContextMenu {
  $expression = @'
(() => {
  const row = [...document.querySelectorAll('.monaco-list-row')]
    .find(element => element.getAttribute('aria-label') === '/demo-app, has actions');
  if (!row) throw new Error('Tree row not found');
  const rectangle = row.getBoundingClientRect();
  return { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height / 2 };
})()
'@
  $point = (& node (Join-Path $repository 'dist/cdp-eval.js') page $expression) | ConvertFrom-Json
  & node (Join-Path $repository 'dist/cdp-mouse.js') $point.x $point.y right
  if ($LASTEXITCODE -ne 0) { throw 'Could not open node context menu' }
}

Invoke-AgentBrowser press Escape
Capture-Frame '01-toolbar.png' 500

Click-Action 'Views and More Actions...'
Capture-Frame '02-toolbar-menu.png' 650
Invoke-AgentBrowser press Escape

Open-ContextMenu
Capture-Frame '03-node-context-menu.png' 650
Invoke-AgentBrowser press Escape

Click-Action 'Search Nodes...'
Capture-Frame '04-search-modes.png' 650
Invoke-AgentBrowser press ArrowDown
Invoke-AgentBrowser press Enter
Invoke-AgentBrowser fill '.quick-input-widget input' '/demo-app/config'
Capture-Frame '05-search-input.png' 650
Invoke-AgentBrowser press Enter
Capture-Frame '06-search-result.png' 1200
Invoke-AgentBrowser press Enter
Capture-Frame '07-search-located.png' 900

Click-Action 'Open Details' '/demo-app/config, has actions'
Capture-Frame '08-node-details.png' 1300
Invoke-AgentBrowser press Escape

Push-Location $frames
$concat = Join-Path $frames 'frames.txt'
Get-ChildItem $frames -Filter '*.png' | Sort-Object Name | ForEach-Object {
  "file '$($_.FullName.Replace("'", "'\\''"))'"
  'duration 2'
} | Set-Content -Encoding ascii $concat
& $ffmpeg -y -f concat -safe 0 -i $concat -vf "fps=2,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a" -loop 0 (Join-Path $repository 'media/demo.gif')
if ($LASTEXITCODE -ne 0) { throw 'ffmpeg GIF conversion failed' }
& $ffmpeg -y -f concat -safe 0 -i $concat -vf 'scale=1280:-2:flags=lanczos' -c:v libx264 -pix_fmt yuv420p (Join-Path $repository 'dist/zk-viewer-demo.mp4')
if ($LASTEXITCODE -ne 0) { throw 'ffmpeg MP4 conversion failed' }
Pop-Location

Get-Item (Join-Path $repository 'media/demo.gif'), (Join-Path $repository 'dist/zk-viewer-demo.mp4') |
  Select-Object FullName, Length, LastWriteTime
