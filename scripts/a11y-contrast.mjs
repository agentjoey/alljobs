#!/usr/bin/env node
// 对比度 + 触控目标 + 横向滚动实测（CDP，明暗两模式）
import { spawn } from 'node:child_process';
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9224;
const BASE = process.argv[2] ?? 'http://127.0.0.1:3510';

const proc = spawn(CH, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/cdp-a11y-profile', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const rpc = (ws, method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  const on = (ev) => { const m = JSON.parse(ev.data); if (m.id === id) { ws.removeEventListener('message', on); m.error ? rej(new Error(method + JSON.stringify(m.error))) : res(m.result); } };
  ws.addEventListener('message', on); ws.send(JSON.stringify({ id, method, params }));
});

const EXPR = `(() => {
  const lum = (c) => { const [r,g,b] = c.match(/\\d+(\\.\\d+)?/g).slice(0,3).map(Number).map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*r + 0.7152*g + 0.0722*b; };
  const parse = (c) => { const p = (c.match(/[\\d.]+/g) || []).map(Number); return { r: p[0]||0, g: p[1]||0, b: p[2]||0, a: p.length > 3 ? p[3] : 1 }; };
  // 逐层向上合成半透明底色，直到遇到不透明层（否则 rgba 底会被当成纯色，得出假比值）
  const bgOf = (el) => {
    const layers = []; let n = el;
    while (n && n !== document.documentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0) layers.push(c); if (c.a === 1) break; n = n.parentElement; }
    const root = parse(getComputedStyle(document.documentElement).backgroundColor);
    let out = layers.length && layers[layers.length-1].a === 1 ? layers.pop() : (root.a === 1 ? root : { r:255,g:255,b:255,a:1 });
    for (let i = layers.length - 1; i >= 0; i--) { const t = layers[i]; out = { r: t.r*t.a + out.r*(1-t.a), g: t.g*t.a + out.g*(1-t.a), b: t.b*t.a + out.b*(1-t.a), a: 1 }; }
    return \`rgb(\${out.r}, \${out.g}, \${out.b})\`;
  };
  const flatten = (fg, bg) => { const f = parse(fg), b = parse(bg); return f.a >= 1 ? fg : \`rgb(\${f.r*f.a + b.r*(1-f.a)}, \${f.g*f.a + b.g*(1-f.a)}, \${f.b*f.a + b.b*(1-f.a)})\`; };
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); const [hi, lo] = a > b ? [a,b] : [b,a]; return (hi + 0.05) / (lo + 0.05); };
  const sel = ['.proj .name','.proj .next','.proj .meta','.attn .why','.attn .title','.entry .text','.entry .slug','.folio-counts','.folio-date','.section-head h2','.stamp.active','.stamp.blocked','.stamp.due','.stamp.paused','.day','.footer span','.tab','.chip','.kv','.crumb','.empty-note','.proj .side .last','.linkrow > a'];
  const out = [];
  for (const s of sel) {
    const el = document.querySelector(s); if (!el) continue;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize); const weight = parseInt(cs.fontWeight) || 400;
    const bg = bgOf(el);
    const r = ratio(flatten(cs.color, bg), bg);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    out.push({ sel: s, size, weight, ratio: +r.toFixed(2), need: large ? 3 : 4.5, ok: r >= (large ? 3 : 4.5) });
  }
  // 触控目标
  const small = [...document.querySelectorAll('a, button, select, input')].map(e => { const r = e.getBoundingClientRect(); return { tag: e.tagName, cls: e.className.toString().slice(0,28), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(x => x.h > 0 && x.h < 24);
  return JSON.stringify({ contrast: out, smallTargets: small.slice(0,8), scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, h1: document.querySelectorAll('h1').length });
})()`;

try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} await sleep(250); }
  for (const [route, label] of [['/', '总览'], ['/projects/pactify-apps', '详情'], ['/log', '日志']]) {
    for (const [scheme, width, mobile] of [['light', 1440, false], ['dark', 1440, false], ['light', 390, true]]) {
      const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?url=about:blank`, { method: 'PUT' })).json();
      const ws = new WebSocket(tab.webSocketDebuggerUrl);
      await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
      await rpc(ws, 'Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile });
      await rpc(ws, 'Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
      await rpc(ws, 'Page.enable');
      await rpc(ws, 'Page.navigate', { url: BASE + route });
      await sleep(1400);
      await rpc(ws, 'Runtime.enable');
      const { result } = await rpc(ws, 'Runtime.evaluate', { expression: EXPR, returnByValue: true });
      const d = JSON.parse(result.value);
      const fails = d.contrast.filter((c) => !c.ok);
      console.log(`\n### ${label} ${scheme} ${width}px  h1=${d.h1} scrollW=${d.scrollW}/${d.clientW}${d.scrollW > d.clientW ? '  ⚠️横向滚动' : ''}`);
      console.log(`  对比度: ${d.contrast.length} 项检查, ${fails.length} 项不达标${fails.length ? ':' : ' ✓'}`);
      for (const f of fails) console.log(`    ✗ ${f.sel} ${f.size}px/${f.weight} → ${f.ratio}:1 (需 ${f.need})`);
      if (d.smallTargets.length) console.log(`  <24px 高交互元素: ${d.smallTargets.map(t => `${t.tag}.${t.cls}(${t.w}x${t.h})`).join(', ')}`);
      await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`);
    }
  }
} finally { proc.kill('SIGKILL'); }
