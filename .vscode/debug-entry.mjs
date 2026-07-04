import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';

const port = 1337;
const url = 'https://localhost:1337';
const readyTimeoutMs = 15000;
const pollIntervalMs = 120;

function killPortListener() {
  const command = `
$ErrorActionPreference = 'Stop'
$port = ${port}
$listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  Where-Object { $_ })

foreach ($listener in $listeners) {
  Stop-Process -Id $listener -Force -ErrorAction SilentlyContinue
}

$deadline = (Get-Date).AddMilliseconds(1200)
do {
  $remaining = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ })

  if (-not $remaining) {
    exit 0
  }

  Start-Sleep -Milliseconds 80
} while ((Get-Date) -lt $deadline)

Write-Error "Port $port is still listening in process(es): $($remaining -join ', ')"
exit 1
`;

  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { stdio: 'inherit', windowsHide: true }
  );
}

function isPortReady(targetPort) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: 'localhost', port: targetPort });
    let settled = false;

    const finish = ready => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(ready);
    };

    socket.setTimeout(120);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function openEdgeWhenReady() {
  const startedAt = Date.now();

  const timer = setInterval(async () => {
    if (Date.now() - startedAt > readyTimeoutMs) {
      clearInterval(timer);
      return;
    }

    if (await isPortReady(port)) {
      clearInterval(timer);
      spawn(
        'cmd.exe',
        ['/d', '/s', '/c', `start "" msedge.exe --new-tab "${url}"`],
        { detached: true, stdio: 'ignore', windowsHide: true }
      ).unref();
    }
  }, pollIntervalMs);

  timer.unref();
}

killPortListener();
openEdgeWhenReady();
await import('../server.js');
