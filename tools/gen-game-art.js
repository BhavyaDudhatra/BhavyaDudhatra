'use strict';
/*
 * Generates the animated SVG scenes shown in the profile README.
 *
 * Why a generator instead of hand-written files: every scene is drawn from a
 * deterministic PRNG, so re-running produces byte-identical output and never
 * creates pointless diffs.
 *
 * Constraints that shape this file: GitHub's README sanitizer strips <script>,
 * <style>, <iframe> and <canvas>, so interactivity is impossible. These are
 * animated SVG *images* referenced via <img>, which GitHub does render — the
 * CSS @keyframes inside each SVG animate the same way the Platane/snk snake does.
 *
 * Every scene is designed so that with animations disabled it still renders as a
 * complete, sensible static frame.
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'games');
fs.mkdirSync(OUT, { recursive: true });

/* ---------- deterministic randomness ---------- */

function rng(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const pad = (n, w) => String(n).padStart(w, '0');

/* ---------- palettes ---------- */

const THEMES = {
  dark: {
    bg: '#0d1117', panel: '#161b22', border: '#30363d', fg: '#c9d1d9', dim: '#8b949e',
    green: '#3fb950', greenDim: '#1a3f2b', red: '#f85149', redDim: '#3d1a1a',
    yellow: '#d29922', blue: '#58a6ff', cyan: '#39c5cf',
  },
  light: {
    bg: '#ffffff', panel: '#f6f8fa', border: '#d0d7de', fg: '#24292f', dim: '#59636e',
    green: '#1a7f37', greenDim: '#dafbe1', red: '#cf222e', redDim: '#ffebe9',
    yellow: '#9a6700', blue: '#0969da', cyan: '#1b7c83',
  },
};

const W = 440;
const H = 260;

function styleBlock(p) {
  return `
<style>
  :root{
    --panel:${p.panel};--border:${p.border};--fg:${p.fg};--dim:${p.dim};
    --green:${p.green};--green-dim:${p.greenDim};--red:${p.red};--red-dim:${p.redDim};
    --yellow:${p.yellow};--blue:${p.blue};--cyan:${p.cyan};--bg:${p.bg};
  }
  text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  .panel{fill:var(--panel)}
  .edge{stroke:var(--border);stroke-width:1}
  .fg{fill:var(--fg)} .dim{fill:var(--dim)} .gr{fill:var(--green)}
  .rd{fill:var(--red)} .yl{fill:var(--yellow)} .bl{fill:var(--blue)} .cy{fill:var(--cyan)}
  .f10{font-size:10px} .f11{font-size:11px} .f12{font-size:12px} .f13{font-size:13px}
  @media (prefers-reduced-motion:reduce){*{animation:none !important}}
</style>`;
}

function svgDoc(p, label, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label}">
${styleBlock(p)}
<rect x="0" y="0" width="${W}" height="${H}" rx="10" class="panel"/>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="none" class="edge"/>
<defs>${defs}</defs>
${body}
</svg>
`;
}

/* ---------- 1. matrix rain ---------- */

const GLYPHS = 'アイウエオカキクケコサシスセソ0123456789ABCDEF<>=+-*/[]{}$#@%&';
const KATAKANA = /[^\x00-\x7F]/;

function matrixRain(p) {
  const r = rng(0x5eed01);
  const fs = 11;
  const colW = 14;
  const cols = Math.floor((W - 24) / colW);
  const rowH = 13;
  const rows = Math.floor((H - 40) / rowH);
  const x0 = 12;
  const y0 = 30;

  let cols_svg = '';
  for (let c = 0; c < cols; c++) {
    let chars = '';
    for (let row = 0; row < rows; row++) {
      const ch = pick(r, GLYPHS.split(''));
      // Head glyph is brightest, tail fades out — the classic matrix look.
      const head = row < 2;
      const op = head ? 1 : Math.max(0.12, 0.85 - row * 0.06);
      const cls = head ? 'gr' : 'fg';
      const esc = ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : ch;
      chars += `<tspan x="${x0 + c * colW}" dy="${rowH}" opacity="${op.toFixed(2)}" class="${cls}">${esc}</tspan>`;
    }
    const dur = (1.9 + r() * 3.4).toFixed(2);
    const del = (-r() * 5).toFixed(2);
    cols_svg += `<text class="f11" x="${x0 + c * colW}" y="${y0}" style="animation:fall ${dur}s linear infinite;animation-delay:${del}s">${chars}</text>`;
  }

  const body = `
<rect x="0" y="0" width="${W}" height="22" rx="10" class="panel"/>
<rect x="0" y="12" width="${W}" height="10" class="panel"/>
<line x1="0" y1="22.5" x2="${W}" y2="22.5" class="edge"/>
<circle cx="14" cy="11" r="3.5" class="rd"/><circle cx="26" cy="11" r="3.5" class="yl"/>
<circle cx="38" cy="11" r="3.5" class="gr"/>
<text x="${W / 2}" y="15" text-anchor="middle" class="dim f11">cat /dev/urandom | tail -f</text>
${cols_svg}
<style>
  @keyframes fall{
    from{transform:translateY(0)}
    to{transform:translateY(${H}px)}
  }
</style>`;

  return svgDoc(p, 'Matrix-style falling code rain', body);
}

/* ---------- 2. minesweeper as a vulnerability grid ---------- */

function vulnGrid(p) {
  const r = rng(0x5eed02);
  const cols = 11;
  const rows = 6;
  const size = 28;
  const gap = 4;
  const oy = 40;
  const gw = cols * size + (cols - 1) * gap;
  const oxc = Math.round((W - gw) / 2);
  const gridBottom = oy + rows * (size + gap) - gap;
  const legendY = gridBottom + 20;

  // Lay mines, then derive honest adjacency counts.
  const mines = [];
  const total = cols * rows;
  const mineCount = 11;
  while (mines.length < mineCount) {
    const idx = Math.floor(r() * total);
    if (!mines.includes(idx)) mines.push(idx);
  }
  const isMine = (c, row) => mines.includes(row * cols + c);
  const counts = [];
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const ny = row + dy;
          const nx = c + dx;
          if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && isMine(nx, ny)) n++;
        }
      }
      counts.push(n);
    }
  }

  // Reveal in a wave sweeping left-to-right so it reads like a scan sweep.
  const order = [];
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) order.push(row * cols + c);
  }

  // Mine counts are capped at 3 for the legend; higher counts roll over to 3 so
// the visual weight stays legible on a small card.
const numColor = { 1: 'bl', 2: 'gr', 3: 'rd' };
const cap = (n) => (n > 3 ? 3 : n);

  let cells = '';
  order.forEach((idx) => {
    const row = Math.floor(idx / cols);
    const c = idx % cols;
    const x = oxc + c * (size + gap);
    const y = oy + row * (size + gap);
    const mine = isMine(c, row);
    const n = counts[idx];
    const delay = (0.15 * c + 0.08 * row).toFixed(2);
    // CSS custom properties only resolve in the style attribute, never in a
    // presentation attribute, so the fill has to be set via style.
    const fill = mine ? 'var(--red-dim)' : 'var(--panel)';
    const label = mine
      ? '<text x="' + (x + size / 2) + '" y="' + (y + size / 2 + 4) + '" text-anchor="middle" class="rd f13">*</text>'
      : n > 0
        ? '<text x="' + (x + size / 2) + '" y="' + (y + size / 2 + 4) + '" text-anchor="middle" class="' + numColor[cap(n)] + ' f13">' + cap(n) + '</text>'
        : '';
    cells +=
      '<g class="cell" style="animation:cellCycle 15s linear infinite both;animation-delay:' + delay + 's">' +
      '<rect x="' + x + '" y="' + y + '" width="' + size + '" height="' + size + '" rx="4" style="fill:' + fill + '" class="edge"/>' +
      label +
      '</g>';
  });

  const body = `
<text x="${W / 2}" y="20" text-anchor="middle" class="dim f11">vuln-grid --scan</text>
${cells}
<text x="14" y="${legendY}" class="dim f11">* vulnerable</text>
<text x="140" y="${legendY}" class="rd f11">1-3 severity</text>
<text x="278" y="${legendY}" class="gr f11">clean</text>
<style>
  @keyframes cellCycle{
    0%{opacity:0}
    3%{opacity:1}
    88%{opacity:1}
    100%{opacity:0}
  }
</style>`;

  return svgDoc(p, 'Minesweeper grid representing a vulnerability scan', body);
}

/* ---------- 3. animated nmap terminal ---------- */

function scanTerminal(p) {
  const r = rng(0x5eed03);
  const openPorts = [
    [22, 'ssh', 'OpenSSH 8.9p1'],
    [80, 'http', 'Apache 2.4.54'],
    [443, 'https', 'nginx 1.24.0'],
    [3306, 'mysql', 'MySQL 8.0.32'],
    [8080, 'http-proxy', 'Jetty 9.4'],
  ];
  const closed = [21, 25, 110, 445, 5432];

  const lines = [];
  lines.push(['dim', '# authorised scope: 10.10.10.0/24 (lab.local)']);
  lines.push(['fg', '$ nmap -sV -p- --min-rate 2000 10.10.10.0/24']);
  lines.push(['dim', '']);
  lines.push(['dim', 'Starting Nmap 7.94 ( https://nmap.org )']);
  lines.push(['dim', 'Nmap scan report for lab.local (10.10.10.7)']);
  lines.push(['dim', 'Host is up (0.021s latency).']);
  lines.push(['dim', '']);
  lines.push(['dim', 'PORT     STATE    SERVICE     VERSION']);
  openPorts.forEach(([port, svc, ver], i) => {
    lines.push([null, pad(port, 5) + '   open      ' + svc.padEnd(11) + ver]);
  });
  closed.forEach((port) => {
    lines.push(['dim', pad(port, 5) + '   closed    tcp']);
  });
  lines.push(['dim', '']);
  lines.push(['yl', '5 open, 5 closed, 1 host up']);
  lines.push(['gr', 'assessment complete']);
  lines.push(['dim', 'lab$ ']);

  // 15 content lines at 13px starting below the 22px title bar fills 255px exactly.
  const LINES_MAX = 15;
  const y0 = 38;
  const lh = 13;
  let body = '';
  lines.forEach(([, text], i) => {
    if (!text) return;
    if (i >= LINES_MAX) return;
    const cls = lines[i][0] || 'gr';
    const delay = (i * 0.28).toFixed(2);
    body +=
      '<text x="14" y="' + (y0 + i * lh) + '" class="f11 ' + cls + ' line" style="animation:lineIn 20s linear infinite both;animation-delay:' + delay + 's">' +
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;') +
      '</text>';
  });

  // Cursor sits after the final prompt line.
  const lastIdx = Math.min(lines.length, LINES_MAX) - 1;
  const prompt = lines[lines.length - 1][1];
  const cursorX = 14 + prompt.length * 6.6;
  const cursorY = y0 + lastIdx * lh + 3;

  const full = `
<rect x="0" y="0" width="${W}" height="22" rx="10" class="panel"/>
<rect x="0" y="12" width="${W}" height="10" class="panel"/>
<line x1="0" y1="22.5" x2="${W}" y2="22.5" class="edge"/>
<circle cx="14" cy="11" r="3.5" class="rd"/><circle cx="26" cy="11" r="3.5" class="yl"/>
<circle cx="38" cy="11" r="3.5" class="gr"/>
<text x="${W / 2}" y="15" text-anchor="middle" class="dim f11">bash - 80x24</text>
${body}
<rect x="${cursorX.toFixed(1)}" y="${cursorY}" width="7" height="12" class="gr" style="animation:blink 1s steps(1) infinite"/>
<style>
  @keyframes lineIn{
    0%,1%{opacity:0}
    4%{opacity:1}
    90%{opacity:1}
    97%,100%{opacity:0}
  }
  @keyframes blink{0%,50%{opacity:1}51%,100%{opacity:0}}
</style>`;

  return svgDoc(p, 'Terminal window showing an nmap scan', full);
}

/* ---------- 4. firewall / packet-filter animation ---------- */

function firewallScene(p) {
  const r = rng(0x5eed04);
  const yMid = 132;
  const lanes = [104, 132, 160];
  const client = { x: 58, y: yMid };
  const fw = { x: 220, y: yMid };
  const server = { x: 382, y: yMid };

  let packets = '';
  for (let i = 0; i < 12; i++) {
    const lane = lanes[i % lanes.length];
    const blocked = i % 3 === 2;
    const dur = (2.4 + r() * 2.2).toFixed(2);
    const del = (-r() * 4.5).toFixed(2);
    const cls = blocked ? 'rd' : 'gr';
    const anim = blocked ? 'blockMove' : 'passMove';
    const dy = (lane - yMid).toFixed(1);
    packets +=
      `<rect x="${client.x - 4}" y="${lane - 4}" width="8" height="8" rx="1.5" class="${cls}" ` +
      `style="--dy:${dy};animation:${anim} ${dur}s linear infinite;animation-delay:${del}s"/>`;
  }

  const fwW = 26;
  const fwH = 104;
  const fwY = yMid - fwH / 2;
  let bricks = '';
  for (let i = 0; i < 9; i++) {
    const y = fwY + 8 + i * 11;
    bricks += `<line x1="${fw.x - fwW / 2 + 2}" y1="${y}" x2="${fw.x + fwW / 2 - 2}" y2="${y}" class="edge"/>`;
  }

  const node = (n, label, tcol) => `
<circle cx="${n.x}" cy="${n.y}" r="19" style="fill:var(--panel)" class="edge"/>
<text x="${n.x}" y="${n.y + 4}" text-anchor="middle" class="f10 ${tcol}">${label}</text>`;

  const body = `
<text x="${W / 2}" y="20" text-anchor="middle" class="dim f11">packet-filter --watch</text>
${node(client, 'HOST', 'fg')}
${node(server, 'API', 'fg')}
<line x1="${client.x + 21}" y1="${yMid}" x2="${fw.x - fwW / 2}" y2="${yMid}" class="edge"/>
<line x1="${fw.x + fwW / 2}" y1="${yMid}" x2="${server.x - 21}" y2="${yMid}" class="edge"/>
<rect x="${fw.x - fwW / 2}" y="${fwY}" width="${fwW}" height="${fwH}" rx="5" style="fill:var(--red-dim)" class="edge"/>
${bricks}
<text x="${fw.x}" y="${fwY - 8}" text-anchor="middle" class="rd f10">WAF</text>
${packets}
<text x="${client.x}" y="${H - 20}" text-anchor="middle" class="gr f10">allowed</text>
<text x="${fw.x + 74}" y="${H - 20}" text-anchor="middle" class="rd f10">blocked</text>
<style>
  @keyframes passMove{
    from{transform:translate(0,var(--dy,0))}
    to{transform:translate(324px,var(--dy,0))}
  }
  @keyframes blockMove{
    0%{transform:translate(0,var(--dy,0))}
    45%{transform:translate(149px,var(--dy,0))}
    55%{transform:translate(140px,var(--dy,0))}
    100%{transform:translate(0,var(--dy,0))}
  }
</style>`;

  return svgDoc(p, 'Network diagram with packets passing or being blocked by a WAF', body);
}

/* ---------- write everything ---------- */

const scenes = [
  ['matrix-rain', matrixRain],
  ['vuln-grid', vulnGrid],
  ['scan-terminal', scanTerminal],
  ['firewall-watch', firewallScene],
];

const written = [];
for (const [name, fn] of scenes) {
  for (const theme of ['dark', 'light']) {
    const file = path.join(OUT, `${name}-${theme}.svg`);
    fs.writeFileSync(file, fn(THEMES[theme]), 'utf8');
    written.push(`${name}-${theme}.svg`);
  }
}

written.forEach((f) => {
  const size = fs.statSync(path.join(OUT, f)).size;
  console.log(`  ${f.padEnd(30)} ${(size / 1024).toFixed(1)} KB`);
});
console.log(`\nWrote ${written.length} files to ${OUT}`);