import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..', '..');

const TARGET_VERSION = '2.2.3';

// DevTools CDP Injector: Injects or upgrades pet runtime in DOM
async function runCdpInjector() {
  const activePortFile = join(homedir(), 'AppData', 'Roaming', 'Antigravity', 'DevToolsActivePort');
  if (!existsSync(activePortFile)) {
    setTimeout(runCdpInjector, 3000);
    return;
  }

  try {
    const port = readFileSync(activePortFile, 'utf8').split(/\r?\n/)[0].trim();
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await res.json();
    const mainPage = targets.find(t => t.type === 'page' && t.title.includes('Antigravity'));

    if (mainPage && mainPage.webSocketDebuggerUrl) {
      const ws = new WebSocket(mainPage.webSocketDebuggerUrl);
      ws.onopen = () => {
        // Check if pet is installed AND matches target version
        ws.send(JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: `Boolean(window.__antigravityPetInstalled && window.__antigravityPetVersion === '${TARGET_VERSION}' && (document.getElementById('ag-pet-container') || document.getElementById('ag-pet-restore-pill')))`,
            returnByValue: true
          }
        }));
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.id === 1) {
            const alreadyUpToDate = data.result?.result?.value === true;
            if (!alreadyUpToDate) {
              const petRuntimeSource = readFileSync(join(__dirname, 'pet-runtime.js'), 'utf8');
              ws.send(JSON.stringify({
                id: 2,
                method: 'Runtime.evaluate',
                params: { expression: petRuntimeSource, userGesture: true, awaitPromise: true }
              }));
            } else {
              ws.close();
            }
          } else if (data.id === 2) {
            console.log(`[Antigravity Pet] Injected v${TARGET_VERSION} successfully.`);
            ws.close();
          }
        } catch {}
      };
      ws.onerror = () => {};
    }
  } catch (err) {}

  setTimeout(runCdpInjector, 4000);
}

runCdpInjector();

const port = parseInt(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || '17892', 10);
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Antigravity Pet Sidecar Running');
});
server.listen(port, '127.0.0.1');
