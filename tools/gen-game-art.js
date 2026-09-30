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

// `w`/`h` are overridable so the banner can use a wider aspect than the cards.
function svgDoc(p, label, body, defs = '', w = W, h = H) {
  // overflow:hidden is stated explicitly rather than relying on the UA default,
  // because the falling-rain layer is drawn off-canvas and depends on clipping.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" overflow="hidden" role="img" aria-label="${label}">
${styleBlock(p)}
<rect x="0" y="0" width="${w}" height="${h}" rx="10" class="panel"/>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="none" class="edge"/>
<defs>${defs}</defs>
${body}
</svg>
`;
}

// Monospace advance width, used to place text that follows a known string.
const charW = (fontSize) => fontSize * 0.6;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------- 0. name banner ---------- */
/*
 * The name is drawn as a 5x7 dot matrix where every pixel is a binary digit:
 * lit pixels are 1, unlit are 0, and the whole thing is tinted with the
 * terminal green from the palette. It replaces both a plain SVG wordmark and
 * the original fixed-width ASCII art, which broke on narrow viewports.
 *
 * The glitch is layered the way real datamosh does it:
 *   1. the green binary grid, which never moves,
 *   2. red/cyan copies offset by a pixel or two (chromatic aberration),
 *   3. horizontal slices clipped to thin bands and shifted sideways.
 * Layer 3 is what sells it; the colour split alone just looks blurry.
 */

// Only the glyphs the wordmark needs. Anything missing here throws at build
// time rather than rendering a blank cell.
const BIN_FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  V: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  Y: ['10001', '10001', '01110', '00100', '00100', '00100', '00100'],
};
const GLYPH_W = 5;
const GLYPH_H = 7;

function wordmark(p) {
  const r = rng(0x5eed00);
  const BW = 1120;
  const BH = 264;
  const name = 'BHAVYA';
  name.split('').forEach((ch) => {
    if (!BIN_FONT[ch]) throw new Error(`BIN_FONT has no glyph for "${ch}"`);
  });

  // Digit pitch is set with letter-spacing, not by assuming a cell width: the
  // real advance for this font is ~0.6em, so a nominal cell size silently
  // throws the whole grid off-centre.
  const fontSize = 11;
  const advance = charW(fontSize);
  const pitch = 20; // horizontal distance between digit centres
  const letterSpacing = pitch - advance;
  const lh = 20; // row pitch, matched to `pitch` so cells read as square
  const cols = name.length * GLYPH_W + (name.length - 1); // +1 gap between glyphs
  const gridW = cols * advance + (cols - 1) * letterSpacing;
  const x0 = Math.round((BW - gridW) / 2);
  const top = 50; // first row baseline
  const gridBottom = top + (GLYPH_H - 1) * lh;
  const cx = BW / 2;

  // The name spelled out in 8-bit ASCII, so the binary row is a real encoding
  // of the wordmark rather than decorative noise.
  const bits = [...name]
    .map((ch) => ch.charCodeAt(0).toString(2).padStart(8, '0'))
    .join(' ');

  // Scrolling binary marquee above the name.
  let strip = '';
  const stripCols = 160;
  for (let i = 0; i < stripCols; i++) strip += r() < 0.5 ? '0' : '1';
  const stripW = stripCols * charW(11);

  // Faint falling 0/1 columns behind everything. Column width is 2 glyphs, so
  // the pitch has to clear that or the last column runs off the right edge.
  let rain = '';
  const rainPitch = 31;
  const rainCols = 32;
  for (let c = 0; c < rainCols; c++) {
    const x = 10 + c * rainPitch;
    let col = '';
    const rows = 3;
    for (let i = 0; i < rows; i++) col += (r() < 0.5 ? '0' : '1') + ' ';
    const dur = (3.5 + r() * 4).toFixed(2);
    const del = (-r() * 6).toFixed(2);
    rain += `<text x="${x}" y="${top - 22}" class="f11 rain" style="animation:fall ${dur}s linear infinite;animation-delay:${del}s">${col}</text>`;
  }

  // The name as a dot matrix of binary digits. Lit pixels are 1, unlit are 0,
  // so the glyph shape is carried by the bright green 1s against dim 0s.
  // Each row is one <text> of equal-length strings at a fixed pitch, which
  // keeps the grid monospaced without needing per-digit positioning.
  const rowStrings = [];
  for (let row = 0; row < GLYPH_H; row++) {
    let line = '';
    for (let g = 0; g < name.length; g++) {
      const glyph = BIN_FONT[name[g]][row];
      // Unlit pixels are rendered as 0 with reduced opacity rather than
      // spaces, so the grid reads as binary all the way across.
      line += glyph.replace(/0/g, '0').replace(/1/g, '1');
      if (g < name.length - 1) line += '0';
    }
    rowStrings.push(line);
  }

  // Grid geometry, used by the sweep clip and the slice bands.
  const gridH = GLYPH_H * lh;
  const bitsY = gridBottom + 44;
  const ruleY = bitsY + 16;
  const roleY = ruleY + 20;

  // Slice bands for the displacement glitch: thin horizontal cuts through the
  // digit rows that jump sideways for a frame. `at` is when the tear fires
  // within the 5s cycle, and they are deliberately uneven — synchronised
  // slices look mechanical rather than like a real signal break.
  // Positions are derived from the row pitch so a layout change moves them.
  const bands = [
    { row: 0, h: 9, at: 0.8 },
    { row: 2, h: 7, at: 3.4 },
    { row: 4, h: 11, at: 2.8 },
    { row: 6, h: 8, at: 4.6 },
  ].map((b) => ({ ...b, y: top + b.row * lh - 8 }));
  const slices = bands
    .map(
      (b, i) =>
        `<clipPath id="wmS${i}"><rect x="0" y="${b.y}" width="${BW}" height="${b.h}"/></clipPath>`
    )
    .join('\n');
  const sliceDelays = bands.map((b, i) => `.r${i}{animation-delay:${b.at}s}`).join('');

  // The matrix is defined once in <defs> and instanced with <use>. Each glitch
  // layer recolours it by setting "color", which the digit tspans pick up via
  // fill:currentColor. Duplicating the markup per layer cost 60KB+ per file.
  // One pass only: a second .replace() would rescan the markup it just inserted
  // and match the "1" inside class="bin1", producing unclosed tags.
  const matrixRow = (txt, i) =>
    `<text x="${x0}" y="${top + i * lh}" class="f11" letter-spacing="${letterSpacing.toFixed(2)}" xml:space="preserve">${txt.replace(
      /[01]/g,
      (d) => `<tspan class="bin${d}">${d}</tspan>`
    )}</text>`;

  const matrix = rowStrings.map(matrixRow).join('\n');

  const defs = `
<linearGradient id="wmSweep" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0%" stop-color="${p.bg}" stop-opacity="0"/>
  <stop offset="50%" stop-color="${p.fg}" stop-opacity="0.7"/>
  <stop offset="100%" stop-color="${p.bg}" stop-opacity="0"/>
</linearGradient>
<clipPath id="wmClip"><rect x="0" y="${top - lh}" width="${BW}" height="${gridH + lh}" /></clipPath>
<clipPath id="wmStripClip"><rect x="0" y="8" width="${BW}" height="24"/></clipPath>
<g id="wmMatrix" class="grid">${matrix}</g>
${slices}`;

  const body = `
<g style="opacity:.16">${rain}</g>
<g clip-path="url(#wmStripClip)">
  <g class="strip" style="animation:marquee 16s linear infinite">
    <text x="${cx - stripW}" y="22" text-anchor="middle" class="f11" xml:space="preserve">${strip}</text>
    <text x="${cx}" y="22" text-anchor="middle" class="f11" xml:space="preserve">${strip}</text>
    <text x="${cx + stripW}" y="22" text-anchor="middle" class="f11" xml:space="preserve">${strip}</text>
  </g>
</g>
<g class="word">
  <use href="#wmMatrix" class="layer base"/>
  <g clip-path="url(#wmClip)">
    <rect x="0" y="${top - lh}" width="150" height="${gridH + lh}" style="fill:url(#wmSweep)" class="sweep"/>
  </g>
  <g class="ab red-group"><use href="#wmMatrix" class="layer"/></g>
  <g class="ab cyan-group"><use href="#wmMatrix" class="layer"/></g>
  ${bands
    .map(
      (b, i) =>
        `<g clip-path="url(#wmS${i})"><g class="sl r${i}"><use href="#wmMatrix" class="layer"/></g></g>`
    )
    .join('\n')}
</g>
<text x="${cx}" y="${bitsY}" text-anchor="middle" class="f11 bits" xml:space="preserve">${bits}</text>
<line x1="${cx - 220}" y1="${ruleY}" x2="${cx + 220}" y2="${ruleY}" class="edge"/>
<text x="${cx}" y="${roleY}" text-anchor="middle" class="dim f11" letter-spacing="3">ETHICAL HACKER · SECURITY RESEARCHER</text>
<style>
  .strip{fill:var(--dim)}
  .rain{fill:var(--cyan)}
  /* Digits take their colour from the inherited "color" property, which each
     use-instance sets, so one matrix definition serves every glitch colour.
     Note: no raw angle brackets are allowed in here; style content is XML.
     The shared matrix must NOT declare a color itself: a declaration on the
     cloned group would outrank the inherited color and every layer, including
     the red/cyan aberration, would render green. */
  .bin1{fill:currentColor}
  .bin0{fill:currentColor;opacity:.28}
  .base{color:var(--green)}
  .sweep{animation:sweep 7s ease-in-out infinite}
  .ab{opacity:0;mix-blend-mode:screen;animation:aberration 5s steps(1) infinite}
  .red-group{color:var(--red)}
  .cyan-group{color:var(--cyan)}
  .sl{opacity:0;mix-blend-mode:screen;animation:slice 5s steps(1) infinite}
  .sl .layer{color:var(--fg)}
  ${sliceDelays}
  .bits{fill:var(--green);opacity:.9;animation:bits 5s steps(1) infinite}
  @keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(${stripW}px)}}
  @keyframes fall{from{transform:translateY(0)}to{transform:translateY(150px)}}
  @keyframes sweep{0%{transform:translateX(-150px)}50%{transform:translateX(${BW}px)}100%{transform:translateX(-150px)}}
  /* Chromatic split: a frame of red/cyan fringing, then clean. */
  @keyframes aberration{
    0%,80%{opacity:0;transform:translate(0,0)}
    81%{opacity:.55;transform:translate(-3px,1px)}
    83%{opacity:.4;transform:translate(3px,-1px)}
    85%,100%{opacity:0;transform:translate(0,0)}
  }
  /* Slices: each band flickers at its own offset so the tear never looks
     synchronised, which is what makes cheap glitch loops read as fake. */
  @keyframes slice{
    0%,4%{opacity:0;transform:translateX(0)}
    5%{opacity:.9;transform:translateX(16px)}
    7%{opacity:.7;transform:translateX(-9px)}
    9%,100%{opacity:0;transform:translateX(0)}
  }
  @keyframes bits{
    0%,79%{opacity:.75}
    80%{opacity:.2}
    82%{opacity:.9}
    85%,100%{opacity:.75}
  }
</style>`;

  return svgDoc(p, 'BHAVYA — ethical hacker and security researcher, glitched with binary', body, defs, BW, BH);
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

/* ---------- 5. digital forensics: memory dump + artifact carving ---------- */

/*
 * A hex dump of a process memory region. The interesting bytes are the ones
 * holding the hidden process name, so the scene is built around a scanner
 * sweeping for a signature and then carving the matching string out.
 */

function forensicsScene(p) {
  const r = rng(0x5eed05);
  const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

  // Deterministic-looking but meaningless bytes; one planted string is the
  // artefact the scan is meant to find.
  const plant = 'mimikatz.exe';
  const rows = 9;
  // 12 bytes per row keeps the hex column and the ASCII gutter both inside the
  // 440px card; 14 pushed the ASCII column ~35px past the right edge.
  const bytesPerRow = 12;
  const y0 = 44;
  const lh = 14;
  const xOff = 14;
  const xHex = 74;
  const xAsc = 74 + bytesPerRow * 3 * charW(11) + 10;

  let dump = '';
  let found = null;
  for (let row = 0; row < rows; row++) {
    const cells = [];
    let ascii = '';
    for (let b = 0; b < bytesPerRow; b++) {
      // Plant the artefact on a specific row so the highlight lands mid-dump.
      if (row === 3 && b >= 2 && b < 2 + plant.length) {
        cells.push(plant.charCodeAt(b - 2));
      } else {
        cells.push(ri(r, 0, 255));
      }
      ascii += b === 2 + Math.floor(plant.length / 2) ? '|' : '.';
    }
    const off = 0x7ffb0000 + row * bytesPerRow;
    const hexStr = cells.map(hex).join(' ');
    const delay = (row * 0.35).toFixed(2);
    dump +=
      `<g style="animation:dumpIn 18s linear infinite both;animation-delay:${delay}s">` +
      `<text x="${xOff}" y="${y0 + row * lh}" class="dim f11">${off.toString(16).toUpperCase().padStart(8, '0')}</text>` +
      `<text x="${xHex}" y="${y0 + row * lh}" class="fg f11" xml:space="preserve">${hexStr}</text>` +
      `<text x="${xAsc}" y="${y0 + row * lh}" class="dim f11">${ascii}</text>` +
      `</g>`;
    if (row === 3) found = off;
  }

  const body = `
<text x="${W / 2}" y="20" text-anchor="middle" class="dim f11">vol.py -f memory.raw --dump --pid 4821</text>
${dump}
<line x1="14" y1="180" x2="${W - 14}" y2="180" class="edge"/>
<g style="animation:carve 18s linear infinite both">
<text x="14" y="199" class="dim f11">signature</text>
<text x="82" y="199" class="rd f11">MZ header + PE stub at 0x${found.toString(16).toUpperCase()}</text>
<text x="14" y="217" class="dim f11">carved</text>
<text x="82" y="217" class="gr f11">mimikatz.exe  (11 bytes)</text>
<text x="14" y="235" class="dim f11">sha256</text>
<text x="82" y="235" class="yl f11">9f2a...c41b  verified</text>
</g>
<rect x="${xHex - 3}" y="${y0 + 3 * lh - 9}" width="${(2 + plant.length) * 3 * charW(11) - 3}" height="12" rx="2" style="fill:var(--red-dim)" class="hl"/>
<style>
  @keyframes dumpIn{
    0%{opacity:0}2%{opacity:1}92%{opacity:1}100%{opacity:0}
  }
  @keyframes carve{
    0%,8%{opacity:0}14%,92%{opacity:1}100%{opacity:0}
  }
  .hl{animation:hlpulse 18s linear infinite}
  @keyframes hlpulse{0%,12%{opacity:0}16%,92%{opacity:1}100%{opacity:0}}
</style>`;

  return svgDoc(p, 'Hex dump of process memory with an artifact carved out', body);
}

/* ---------- 6. ethical hacking: web app assessment ---------- */

/*
 * Shows the assessment pipeline rather than a single tool: a parameter is
 * probed, a payload is proven, and the finding is graded. The lab framing and
 * the "authorised" banner keep it clearly defensive.
 */

function webAssessScene(p) {
  const steps = [
    ['dim', 'target', 'lab.local  (authorised)'],
    ['dim', 'surface', '12 routes · 3 forms'],
    ['yl', 'probe', "id=1' OR '1'='1"],
    ['gr', 'confirmed', 'SQLi · parameter id'],
    ['rd', 'severity', 'HIGH  cvss 9.8'],
  ];

  const y0 = 46;
  const lh = 21;
  let rows = '';
  steps.forEach(([, tag, val], i) => {
    const cls = steps[i][0];
    const delay = (i * 0.9).toFixed(2);
    rows +=
      `<g style="animation:stepIn 16s linear infinite both;animation-delay:${delay}s">` +
      `<text x="14" y="${y0 + i * lh}" class="dim f11">${esc(tag)}</text>` +
      `<text x="86" y="${y0 + i * lh}" class="${cls} f12">${esc(val)}</text>` +
      `</g>`;
  });

  // Severity meter fills as the finding is graded.
  const meterW = 200;
  rows +=
    `<g style="animation:stepIn 16s linear infinite both;animation-delay:3.6s">` +
    `<rect x="14" y="${y0 + 5 * lh - 11}" width="${meterW}" height="8" rx="4" style="fill:var(--panel)" class="edge"/>` +
    `<rect x="14" y="${y0 + 5 * lh - 11}" width="0" height="8" rx="4" class="rd meter"/>` +
    `</g>`;

  const body = `
<text x="${W / 2}" y="20" text-anchor="middle" class="dim f11">webapp --assess --scope authorised</text>
${rows}
<g style="animation:stepIn 16s linear infinite both;animation-delay:4.5s">
<line x1="14" y1="196" x2="${W - 14}" y2="196" class="edge"/>
<text x="14" y="216" class="dim f11">remediation</text>
<text x="86" y="216" class="fg f11">parameterised queries</text>
<text x="14" y="234" class="dim f11">reported</text>
<text x="86" y="234" class="gr f11">finding-001.md  ·  triage: open</text>
</g>
<style>
  @keyframes stepIn{0%{opacity:0;transform:translateX(-6px)}3%{opacity:1;transform:translateX(0)}92%{opacity:1}100%{opacity:0}}
  .meter{animation:meterFill 16s linear infinite;animation-delay:3.6s}
  @keyframes meterFill{0%,22%{width:0}40%,92%{width:${meterW}px}100%{width:0}}
</style>`;

  return svgDoc(p, 'Web application assessment showing a confirmed SQL injection finding', body);
}

/* ---------- 7. incident response timeline ---------- */

/*
 * A correlated event timeline. Each event lights up in sequence, the connecting
 * line draws itself, and the summary only appears once the whole chain is known.
 */

function irTimelineScene(p) {
  const r = rng(0x5eed07);
  const events = [
    ['09:14', 'brute force', 'rd'],
    ['09:41', 'account lockout', 'yl'],
    ['10:02', 'lateral movement', 'rd'],
    ['10:38', 'data staging', 'rd'],
    ['11:20', 'host isolated', 'gr'],
  ];

  const y = 92;
  // Labels are centred on their node, so the end nodes need extra inset for the
  // text half-width or the longest label runs off the card.
  const inset = 62;
  const x0 = inset;
  const x1 = W - inset;
  const step = (x1 - x0) / (events.length - 1);
  const trackLen = W - 68;

  let nodes = '';
  events.forEach(([time, label, cls], i) => {
    const x = x0 + i * step;
    const delay = (i * 1.1).toFixed(2);
    const above = i % 2 === 0;
    const ly = above ? y - 34 : y + 42;
    nodes +=
      `<g style="animation:pop 20s linear infinite both;animation-delay:${delay}s">` +
      `<circle cx="${x}" cy="${y}" r="5" class="${cls}"/>` +
      `<circle cx="${x}" cy="${y}" r="5" style="fill:none" class="${cls} ring"/>` +
      `<text x="${x}" y="${ly}" text-anchor="middle" class="${cls} f11">${time}</text>` +
      `<text x="${x}" y="${ly + 14}" text-anchor="middle" class="fg f10">${label}</text>` +
      `</g>`;
  });

  const body = `
<text x="${W / 2}" y="20" text-anchor="middle" class="dim f11">incident #4471 -- correlate</text>
<line x1="34" y1="${y}" x2="${W - 34}" y2="${y}" class="edge track"/>
<line x1="34" y1="${y}" x2="34" y2="${y}" class="gr draw"/>
${nodes}
<g style="animation:sum 20s linear infinite both;animation-delay:6s">
<line x1="14" y1="196" x2="${W - 14}" y2="196" class="edge"/>
<text x="14" y="216" class="dim f11">chain</text>
<text x="86" y="216" class="fg f11">credential abuse to exfil attempt</text>
<text x="14" y="234" class="dim f11">status</text>
<text x="86" y="234" class="gr f11">contained  ·  rotating credentials</text>
</g>
<style>
  .ring{animation:ring 20s ease-out infinite;transform-box:fill-box;transform-origin:center}
  .draw{stroke-dasharray:${trackLen};stroke-dashoffset:${trackLen};animation:draw 20s linear infinite}
  @keyframes pop{0%{opacity:0;transform:scale(0.2)}2%{opacity:1;transform:scale(1)}94%{opacity:1}100%{opacity:0}}
  @keyframes ring{0%{opacity:.8;transform:scale(1)}2%,100%{opacity:0;transform:scale(2.4)}}
  @keyframes draw{0%{stroke-dashoffset:${trackLen}}30%{stroke-dashoffset:0}94%{stroke-dashoffset:0}100%{stroke-dashoffset:${trackLen}}}
  @keyframes sum{0%,29%{opacity:0}34%,94%{opacity:1}100%{opacity:0}}
</style>`;

  return svgDoc(p, 'Incident response timeline correlating a suspected breach', body);
}

/* ---------- 8. TLS handshake ---------- */

/*
 * Client and server exchange a handshake, then the session turns encrypted.
 * The lock colour transition is the payload of the animation.
 */

function tlsScene(p) {
  const steps = [
    ['ClientHello', 'right', 'bl'],
    ['ServerHello', 'left', 'bl'],
    ['Certificate', 'left', 'yl'],
    ['Key exchange', 'right', 'cy'],
    ['Finished', 'left', 'gr'],
  ];

  // Messages stack above the endpoints so the two never overlap.
  const y = 142;
  const leftX = 62;
  const rightX = W - 62;
  const top = 42;
  const gap = 17;

  let msgs = '';
  steps.forEach(([label, dir, cls], i) => {
    const my = top + i * gap;
    const fromX = dir === 'right' ? leftX + 22 : rightX - 22;
    const toX = dir === 'right' ? rightX - 22 : leftX + 22;
    const tx = dir === 'right' ? fromX + 8 : fromX - 8;
    const dur = (1.1 + i * 0.15).toFixed(2);
    const del = (i * 0.85).toFixed(2);
    msgs +=
      `<g class="msg" style="animation:msg 15s linear infinite both;animation-delay:${del}s">` +
      `<line x1="${fromX}" y1="${my}" x2="${toX}" y2="${my}" class="${cls} edge"/>` +
      `<text x="${tx}" y="${my - 3}" class="${cls} f10">${label}</text>` +
      `</g>`;
  });

  const body = `
<text x="${W / 2}" y="20" text-anchor="middle" class="dim f11">openssl s_client -tls1_3 -connect lab.local:443</text>
${msgs}
<circle cx="${leftX}" cy="${y}" r="18" style="fill:var(--panel)" class="edge"/>
<text x="${leftX}" y="${y + 4}" text-anchor="middle" class="fg f10">you</text>
<circle cx="${rightX}" cy="${y}" r="18" style="fill:var(--panel)" class="edge"/>
<text x="${rightX}" y="${y + 4}" text-anchor="middle" class="fg f10">srv</text>
<text x="${W / 2}" y="${y + 4}" text-anchor="middle" class="lock f12">locked</text>
<text x="${W / 2}" y="${y + 4}" text-anchor="middle" class="lockdone f11">TLS_AES_256_GCM</text>
<text x="${W / 2}" y="222" text-anchor="middle" class="dim f11">1-RTT handshake  ·  cert verified  ·  no downgrade</text>
<style>
  .msg{opacity:0}
  .lock{fill:var(--yellow)}
  .lockdone{fill:var(--green);opacity:0}
  @keyframes msg{0%{opacity:0}3%{opacity:1}26%{opacity:1}30%,100%{opacity:0}}
  /* The lock resolves only once every handshake step has been exchanged. */
  .lock{animation:lockColor 15s steps(1) infinite}
  .lockdone{animation:doneColor 15s steps(1) infinite}
  @keyframes lockColor{0%,29%{fill:var(--yellow)}30%,100%{fill:var(--green)}}
  @keyframes doneColor{0%,29%{opacity:0}30%,100%{opacity:1}}
</style>`;

  return svgDoc(p, 'TLS 1.3 handshake between a client and server', body);
}

/* ---------- write everything ---------- */

const scenes = [
  ['wordmark', wordmark],
  ['matrix-rain', matrixRain],
  ['vuln-grid', vulnGrid],
  ['scan-terminal', scanTerminal],
  ['firewall-watch', firewallScene],
  ['forensics-dump', forensicsScene],
  ['web-assess', webAssessScene],
  ['ir-timeline', irTimelineScene],
  ['tls-handshake', tlsScene],
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