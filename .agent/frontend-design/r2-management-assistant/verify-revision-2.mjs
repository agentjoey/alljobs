#!/usr/bin/env node
// Focused browser-contract check for R2 mockup revision 2.
//
// Verifies the two user-approved conditions that motivated this revision:
//   1. The Companion composer is PERSISTENT — present and anchored at the
//      bottom of the companion plane in BOTH the `ready` and `answer` states
//      (including after an answer renders).
//   2. The result is presented in a clearly labelled, visually DISTINCT
//      `Companion output` run-record area with structured sections (answer,
//      facts, inferences, unknowns, recommendations).
//
// Also re-checks the true-390px render: no horizontal scroll.
//
// Standalone (no repo deps, no model call, no write). Node built-ins only,
// driven over CDP like scripts/shot.mjs.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexUrl = 'file://' + resolve(__dirname, 'mockup/index.html');
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9224;

const proc = spawn(CH, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/cdp-r2rev2-profile', 'about:blank',
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

const failures = [];
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else { failures.push(name); console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

async function evalJs(ws, expression) {
  const r = await rpc(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

try {
  await waitPort();
  const tab = await newTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  await rpc(ws, 'Page.enable');
  await rpc(ws, 'Runtime.enable');

  async function navigate(state, width, mobile) {
    await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
      width, height: 900, deviceScaleFactor: 2, mobile,
    });
    const loaded = new Promise((r) => {
      ws.addEventListener('message', function h(ev) {
        const m = JSON.parse(ev.data);
        if (m.method === 'Page.loadEventFired') { ws.removeEventListener('message', h); r(); }
      });
    });
    await rpc(ws, 'Page.navigate', { url: indexUrl + '?state=' + state });
    await Promise.race([loaded, sleep(8000)]);
    await rpc(ws, 'Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
    await sleep(300);
  }

  const ANCHOR_SNIPPET = `(() => {
    const p = document.getElementById('assistant-root');
    const c = document.querySelector('.assistant-composer');
    if (!p || !c) return { composerPresent: false, lastChild: false };
    return {
      composerPresent: true,
      lastChild: p.lastElementChild === c,
      hasTextarea: !!c.querySelector('textarea#assistant-question'),
      hasAsk: !!c.querySelector('#composer-send'),
      scopeCue: c.textContent.includes('tradelinks'),
      modeCue: /standard|deep/i.test(c.textContent),
    };
  })()`;

  console.log('== ready state (1440) — persistence + anchor ==');
  await navigate('ready', 1440, false);
  let v = await evalJs(ws, ANCHOR_SNIPPET);
  check('composer present', v.composerPresent);
  check('composer is bottom-most element of plane', v.lastChild);
  check('composer has textarea + Ask', v.hasTextarea && v.hasAsk);
  check('composer carries project scope', v.scopeCue);
  check('composer carries mode', v.modeCue);

  console.log('== answer state (1440) — persistence + distinct output ==');
  await navigate('answer', 1440, false);
  v = await evalJs(ws, ANCHOR_SNIPPET);
  check('composer present after answer', v.composerPresent);
  check('composer is bottom-most element after answer', v.lastChild);
  check('composer has textarea + Ask after answer', v.hasTextarea && v.hasAsk);

  v = await evalJs(ws, `(() => {
    const o = document.querySelector('.companion-output');
    const label = o ? (o.querySelector('.companion-output__label') || {}).textContent : '';
    const has = (sel) => !!(o && o.querySelector(sel));
    return {
      outputPresent: !!o,
      label: label ? label.trim().toLowerCase() : '',
      runId: o ? (o.querySelector('.companion-output__run') || {}).textContent || '' : '',
      answer: has('[aria-label="Direct answer"]'),
      facts: has('[aria-label="Confirmed facts"]'),
      infer: has('[aria-label="Inferences"]'),
      unknown: has('[aria-label="Unknowns"]'),
      rec: has('[aria-label="Recommendations"]'),
    };
  })()`);
  check('Companion output region present', v.outputPresent);
  check('output labelled "Companion output"', v.label === 'companion output', `got "${v.label}"`);
  check('output has run-record identity', /\brun\b/i.test(v.runId), `got "${v.runId}"`);
  check('output has Direct answer section', v.answer);
  check('output has Confirmed facts section', v.facts);
  check('output has Inferences section', v.infer);
  check('output has Unknowns section', v.unknown);
  check('output has Recommendations section', v.rec);

  console.log('== answer state (true 390px) — render / overflow ==');
  await navigate('answer', 390, true);
  v = await evalJs(ws, `(() => {
    const c = document.querySelector('.assistant-composer');
    const p = document.getElementById('assistant-root');
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      composerPresent: !!c,
      lastChild: !!(p && c && p.lastElementChild === c),
      composerHasInput: !!(c && c.querySelector('textarea#assistant-question')),
    };
  })()`);
  check('390px: no horizontal scroll', v.scrollWidth <= v.clientWidth, `client=${v.clientWidth} scroll=${v.scrollWidth}`);
  check('390px: composer present in sheet', v.composerPresent);
  check('390px: composer is bottom-most element', v.lastChild);
  check('390px: composer usable (textarea present)', v.composerHasInput);

  console.log('');
  if (failures.length) {
    console.log(`${failures.length} check(s) FAILED`);
    process.exitCode = 1;
  } else {
    console.log('All checks PASSED');
  }
} finally {
  proc.kill('SIGKILL');
}
