#!/usr/bin/env node
// CDP full-page screenshot with real device metrics (fixes headless min-window-width=500)
// usage: node shot.mjs <url> <out.png> <width> <scale> <mobile:0|1>
import { spawn } from 'node:child_process';

const [url, out, widthArg, scaleArg, mobileArg] = process.argv.slice(2);
const width = Number(widthArg || 1440);
const scale = Number(scaleArg || 1);
const mobile = mobileArg === '1';
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9223;

const proc = spawn(CH, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/cdp-shot-profile', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitPort() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('chrome debug port never came up');
}

async function newTab() {
  for (const method of ['PUT', 'GET']) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/new?url=about:blank`, { method });
      if (r.ok) return await r.json();
    } catch {}
  }
  throw new Error('could not create tab');
}

let seq = 0;
function rpc(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === id) {
        ws.removeEventListener('message', onMsg);
        m.error ? reject(new Error(method + ': ' + JSON.stringify(m.error))) : resolve(m.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

try {
  await waitPort();
  const tab = await newTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

  await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
    width, height: 900, deviceScaleFactor: scale, mobile,
  });
  await rpc(ws, 'Page.enable');
  const loaded = new Promise((r) => {
    ws.addEventListener('message', function h(ev) {
      const m = JSON.parse(ev.data);
      if (m.method === 'Page.loadEventFired') { ws.removeEventListener('message', h); r(); }
    });
  });
  await rpc(ws, 'Page.navigate', { url });
  await Promise.race([loaded, sleep(8000)]);
  await rpc(ws, 'Runtime.enable');
  await rpc(ws, 'Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
  await sleep(300);

  const shot = await rpc(ws, 'Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true, optimizeForSpeed: true,
  });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  const { size } = (await import('node:fs')).statSync(out);
  console.log(`OK ${out} ${size}b width=${width} scale=${scale} mobile=${mobile}`);
} finally {
  proc.kill('SIGKILL');
}
