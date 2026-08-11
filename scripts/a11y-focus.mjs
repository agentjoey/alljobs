#!/usr/bin/env node
// 非文字对比度实测：焦点环 / tally 梯 / 分隔线（上一轮审计漏掉的维度）
import { spawn } from 'node:child_process';
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9225;
const BASE = process.argv[2] ?? 'http://127.0.0.1:3510';
const proc = spawn(CH, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/cdp-focus-profile', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const rpc = (ws, m, p = {}) => new Promise((res, rej) => { const id = ++seq;
  const on = (ev) => { const x = JSON.parse(ev.data); if (x.id === id) { ws.removeEventListener('message', on); x.error ? rej(new Error(m)) : res(x.result); } };
  ws.addEventListener('message', on); ws.send(JSON.stringify({ id, method: m, params: p })); });

const EXPR = `(() => {
  const P = (c) => { const n = (c.match(/[\\d.]+/g)||[]).map(Number); return { r:n[0]||0, g:n[1]||0, b:n[2]||0, a: n.length>3?n[3]:1 }; };
  const L = (c) => { const p = P(c); const f = (v) => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(p.r)+0.7152*f(p.g)+0.0722*f(p.b); };
  const over = (fg, bg) => { const f = P(fg), b = P(bg); return \`rgb(\${f.r*f.a+b.r*(1-f.a)}, \${f.g*f.a+b.g*(1-f.a)}, \${f.b*f.a+b.b*(1-f.a)})\`; };
  const ratio = (x, y) => { const a = L(x), b = L(y); const [h,l] = a>b?[a,b]:[b,a]; return +((h+0.05)/(l+0.05)).toFixed(2); };
  const card = getComputedStyle(document.querySelector('.sheet') || document.body).backgroundColor;
  const page = getComputedStyle(document.body).backgroundColor;
  const out = { focus: [], tally: [], sep: null };
  // 焦点环：真实聚焦后读 outline
  { // 由真实 Tab 键驱动（:focus-visible 只认键盘），此处只读当前 activeElement
    const el = document.activeElement;
    if (el && el !== document.body) {
      const cs = getComputedStyle(el);
      const bgHost = (() => { let n = el; while (n && n !== document.documentElement) { const b = getComputedStyle(n).backgroundColor; if (P(b).a === 1) return b; n = n.parentElement; } return page; })();
      out.focus.push({ name: (el.className || el.tagName).toString().slice(0, 34), width: cs.outlineWidth, style: cs.outlineStyle,
        vsCard: ratio(over(cs.outlineColor, bgHost), bgHost), vsPage: ratio(over(cs.outlineColor, page), page),
        shadow: cs.boxShadow.slice(0, 40) });
    }
  }
  const t = document.querySelectorAll('.tally i');
  const seen = new Set();
  for (const i of t) { const v = i.getAttribute('data-v') || '0'; if (seen.has(v)) continue; seen.add(v);
    out.tally.push({ step: v, vsCard: ratio(over(getComputedStyle(i).backgroundColor, card), card) }); }
  const row = document.querySelector('.row + .row');
  if (row) { const cs = getComputedStyle(row, '::before'); out.sep = ratio(over(cs.backgroundColor, card), card); }
  return JSON.stringify(out);
})()`;

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {} await sleep(250); }
  for (const scheme of ['light', 'dark']) {
    const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?url=about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    await rpc(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await rpc(ws, 'Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await rpc(ws, 'Page.enable');
    await rpc(ws, 'Page.navigate', { url: BASE + '/' });
    await sleep(1500);
    await rpc(ws, 'Runtime.enable');
    console.log(`\n### ${scheme}`);
    let d = null;
    for (let step = 1; step <= 9; step++) {   // 真实 Tab 键逐个走过可聚焦控件
      await rpc(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
      await rpc(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
      await sleep(90);
      const { result } = await rpc(ws, 'Runtime.evaluate', { expression: EXPR, returnByValue: true });
      d = JSON.parse(result.value);
      for (const f of d.focus) console.log(`  Tab${step} ${f.name}: outline ${f.width} ${f.style} · vs宿主 ${f.vsCard}:1 ${f.vsCard >= 3 && f.style !== 'none' ? '✓' : '✗ (需 3:1 实线)'}`);
    }
    console.log(`  tally 梯 vs 卡面: ${d.tally.map((t) => `${t.step}档 ${t.vsCard}`).join(' · ')}`);
    console.log(`  分隔线 vs 卡面: ${d.sep}:1`);
    await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`);
  }
} finally { proc.kill('SIGKILL'); }
