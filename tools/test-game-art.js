'use strict';
/*
 * Validates the generated SVG scenes before they are committed and shown on the
 * profile. Catches the classes of mistake that are invisible in the source but
 * obvious on the rendered page.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..', 'games');
const SCENES = [
  ['wordmark', 'sweep'],
  ['matrix-rain', 'fall'],
  ['vuln-grid', 'cellCycle'],
  ['scan-terminal', 'lineIn'],
  ['firewall-watch', 'passMove'],
  ['forensics-dump', 'dumpIn'],
  ['web-assess', 'stepIn'],
  ['ir-timeline', 'pop'],
  ['tls-handshake', 'msg'],
];

// Display name shown under each card in the README, keyed by SVG filename.
// Keeping this explicit means a caption can never silently drift from its image.
const DISPLAY_NAME = {
  'scan-terminal': 'nmap',
  'vuln-grid': 'vuln-grid',
  'firewall-watch': 'packet-filter',
  'matrix-rain': 'entropy',
  'forensics-dump': 'forensics',
  'web-assess': 'web-assess',
  'ir-timeline': 'incident-response',
  'tls-handshake': 'tls-handshake',
};

// The banner is not captioned in a card grid, so it is excluded from that check.
const BANNER = 'wordmark';

let failures = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
};
const num0 = (v) => parseFloat(v || '0');

console.log('\n== generator runs and output is current ==');
// This is the check that was missing: the suite used to validate only the
// committed SVGs, so a generator that crashed still reported all green while
// the profile kept serving stale artwork.
{
  const root = path.join(__dirname, '..');
  let out = '';
  let code = 0;
  try {
    out = require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'gen-game-art.js')], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    code = e.status === undefined ? 1 : e.status;
    out = `${e.stdout || ''}${e.stderr || ''}`;
  }
  ok('gen-game-art.js exits cleanly', code === 0, out.split('\n').slice(0, 6).join(' | '));

  // A throwing generator must never leave a stale file looking validated.
  const dirty = [];
  for (const [scene] of SCENES) {
    for (const theme of ['dark', 'light']) {
      const f = path.join(DIR, `${scene}-${theme}.svg`);
      if (!fs.existsSync(f)) continue;
      const age = Date.now() - fs.statSync(f).mtimeMs;
      if (age < 60_000) dirty.push(`${scene}-${theme}.svg`);
    }
  }
  ok('regeneration rewrote every scene', dirty.length === SCENES.length * 2,
    `rewrote ${dirty.length} of ${SCENES.length * 2}`);

  // Output must be deterministic: rerunning must not produce a diff.
  const before = SCENES.flatMap(([s]) => ['dark', 'light'].map((t) => `${s}-${t}.svg`))
    .map((f) => fs.readFileSync(path.join(DIR, f), 'utf8'));
  require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'gen-game-art.js')], {
    cwd: root, stdio: 'ignore',
  });
  const after = SCENES.flatMap(([s]) => ['dark', 'light'].map((t) => `${s}-${t}.svg`))
    .map((f) => fs.readFileSync(path.join(DIR, f), 'utf8'));
  const drift = before.filter((b, i) => b !== after[i]).length;
  ok('generation is deterministic', drift === 0, `${drift} file(s) differ between runs`);
}

console.log('\n== files exist ==');
const files = [];
for (const [scene] of SCENES) {
  for (const theme of ['dark', 'light']) {
    const f = path.join(DIR, `${scene}-${theme}.svg`);
    const exists = fs.existsSync(f);
    ok(`${scene}-${theme}.svg exists`, exists);
    if (exists) files.push(f);
  }
}

console.log('\n== parses as XML ==');
const parsed = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let doc = null;
  let err = '';
  try {
    doc = new JSDOM(src, { contentType: 'image/svg+xml' });
  } catch (e) {
    err = e.message;
  }
  ok(`${path.basename(f)} is well-formed XML`, !!doc, err);
  if (doc) parsed.push({ file: f, src, doc });
}

console.log('\n== structure ==');
const dims = {};
for (const { file, doc } of parsed) {
  const name = path.basename(file);
  const svg = doc.window.document.documentElement;
  ok(`${name} root is <svg>`, svg.tagName === 'svg', svg.tagName);
  ok(`${name} has viewBox`, !!svg.getAttribute('viewBox'));
  ok(`${name} has explicit width/height`, !!svg.getAttribute('width') && !!svg.getAttribute('height'));
  ok(`${name} has an accessible label`, !!svg.getAttribute('aria-label'));
  ok(`${name} declares xmlns`, (svg.getAttribute('xmlns') || '').includes('2000/svg'));
  ok(`${name} has a <style> block for keyframes`, !!doc.window.document.querySelector('style'));
  // Sans a declared viewBox, GitHub would render it at an arbitrary size.
  const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  ok(`${name} viewBox is 4 numeric parts`, vb.length === 4 && vb.every((n) => !isNaN(n)), svg.getAttribute('viewBox'));
  // width/height must agree with the viewBox or the card distorts.
  ok(`${name} width matches viewBox`, num0(svg.getAttribute('width')) === vb[2],
    `w=${svg.getAttribute('width')} vb=${vb[2]}`);
  ok(`${name} height matches viewBox`, num0(svg.getAttribute('height')) === vb[3],
    `h=${svg.getAttribute('height')} vb=${vb[3]}`);
  dims[name] = { w: vb[2], h: vb[3] };
}

// The banner is a different shape to the cards; every card must be identical so
// the README table stays on a regular grid.
{
  const cards = Object.entries(dims).filter(([n]) => !n.startsWith(`${BANNER}-`));
  const uniq = new Set(cards.map(([, d]) => `${d.w}x${d.h}`));
  ok('all cards share one size', uniq.size === 1, [...uniq].join(' '));
  const banner = dims[`${BANNER}-dark.svg`];
  ok('banner is wider than the cards', banner && banner.w > uniq.size && [...uniq][0].split('x')[0] > 0
    && banner.w > Number([...uniq][0].split('x')[0]), banner ? `${banner.w}` : 'missing');
  ok('banner has a 5:1-ish aspect', banner && banner.w / banner.h > 4 && banner.w / banner.h < 6,
    banner ? (banner.w / banner.h).toFixed(2) : 'missing');
}

console.log('\n== animation wiring ==');
for (const { file, src, doc } of parsed) {
  const name = path.basename(file);
  const defined = new Set([...src.matchAll(/@keyframes\s+([A-Za-z][\w]*)/g)].map((m) => m[1]));
  const used = new Set([...src.matchAll(/animation:\s*([A-Za-z][\w]*)/g)].map((m) => m[1]));
  const missing = [...used].filter((k) => k !== 'none' && !defined.has(k));
  ok(`${name} every animation has keyframes`, missing.length === 0, missing.join(','));

  const counts = [...src.matchAll(/animation:/g)].length;
  ok(`${name} actually animates something`, counts > 0, `count=${counts}`);

  ok(`${name} respects prefers-reduced-motion`,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(src));
}

console.log('\n== SVG feature restrictions (img context) ==');
for (const { file, src, doc } of parsed) {
  const name = path.basename(file);
  // An <img>-referenced SVG is a static, non-interactive document: no scripts,
  // no external references, no foreignObject.
  ok(`${name} has no <script>`, !/<script[\s>]/i.test(src));
  ok(`${name} has no <foreignObject>`, !/<foreignObject/i.test(src));
  ok(`${name} has no external <image href>`, !/<image[\s>][^>]*href\s*=\s*["']https?:/i.test(src));
  ok(`${name} embeds no external font`, !/@font-face|@import/i.test(src));
}

console.log('\n== theming pairs differ ==');
for (const [scene] of SCENES) {
  const dark = fs.readFileSync(path.join(DIR, `${scene}-dark.svg`), 'utf8');
  const light = fs.readFileSync(path.join(DIR, `${scene}-light.svg`), 'utf8');
  ok(`${scene} dark != light`, dark !== light);
}

console.log('\n== geometry sanity ==');
for (const { file, doc } of parsed) {
  const name = path.basename(file);
  const svg = doc.window.document.documentElement;
  const [, , vbW, vbH] = (svg.getAttribute('viewBox') || '0 0 0 0').split(/\s+/).map(Number);
  let escapes = 0;
  const offenders = [];
  // A clipped group is bounded by its clip, so its children may legitimately
  // extend past the card (a scrolling marquee has to). Content inside an
  // unclipped group does not get that exemption.
  const clipped = new Set();
  doc.window.document.querySelectorAll('[clip-path]').forEach((g) => {
    [...g.querySelectorAll('*')].forEach((c) => clipped.add(c));
  });
  // Layers that are deliberately drawn off-canvas: the falling-rain columns
  // start below the frame and travel in. That is only safe because the root
  // clips, so the exemption is conditional on overflow:hidden being declared.
  const rootClips = (svg.getAttribute('overflow') || '') === 'hidden';
  ok(`${name} root clips off-canvas layers`, rootClips, svg.getAttribute('overflow') || 'unset');
  const offCanvas = new Set();
  if (rootClips) {
    doc.window.document.querySelectorAll('.rain').forEach((g) => {
      [...g.querySelectorAll('*')].forEach((c) => offCanvas.add(c));
    });
  }
  // Content inside <defs> is a template, not painted output; the wordmark matrix
  // lives there and is instanced with <use>, so judging it as drawn content
  // reports positions that never appear.
  doc.window.document.querySelectorAll('defs *').forEach((el) => clipped.add(el));
  doc.window.document.querySelectorAll('rect, circle, text, line').forEach((el) => {
    // Full-bleed backgrounds are intentional and fill the card exactly, so
    // they are excluded; this check targets stray content drawn off-card.
    if (el.tagName === 'rect' && num0(el.getAttribute('width')) === vbW) return;
    if (clipped.has(el) || offCanvas.has(el)) return;
    const num = (a) => parseFloat(el.getAttribute(a) || '0');
    let x;
    let y;
    let w;
    let h;
    if (el.tagName === 'text') {
      // Estimate the text box, honouring the anchor: for centred text x is the
      // midpoint, so treating it as the left edge produces false overflows.
      const size = num0((el.getAttribute('class') || '').match(/f(\d+)/)?.[1] || 11);
      const anchor = el.getAttribute('text-anchor') || 'start';
      // A column of <tspan>s repeats the same x, so its real width is one glyph
      // even though textContent concatenates every row.
      const spans = [...el.querySelectorAll('tspan')];
      if (spans.length > 1) {
        x = num0(spans[0].getAttribute('x') ?? el.getAttribute('x'));
        w = Math.max(...spans.map((s) => s.textContent.length)) * size * 0.6;
        const dy = num0(spans[0].getAttribute('dy')) || size * 1.2;
        y = num('y') - size * 0.8;
        h = size + Math.abs(dy) * (spans.length - 1);
      } else {
        w = el.textContent.length * size * 0.6;
        h = size;
        x = anchor === 'middle' ? num('x') - w / 2 : anchor === 'end' ? num('x') - w : num('x');
        y = num('y') - size * 0.8;
      }
    } else {
      x = num('x');
      y = num('y');
      w = num('width');
      h = num('height');
    }
    if (x < -2 || y < -2 || x + w > vbW + 2 || y + h > vbH + 2) {
      escapes++;
      offenders.push(`<${el.tagName}> ${(el.textContent || '').slice(0, 18)} right=${(x + w).toFixed(0)} bottom=${(y + h).toFixed(0)}`);
    }
  });
  ok(`${name} no unclipped content outside the viewBox`, escapes === 0,
    `offenders=${escapes} ${offenders.slice(0, 3).join(' | ')}`);
}

console.log('\n== vulns grid data integrity ==');
{
  const src = fs.readFileSync(path.join(DIR, 'vuln-grid-dark.svg'), 'utf8');
  const cells = (src.match(/class="cell"/g) || []).length;
  ok('grid has 11x6 = 66 cells', cells === 66, `cells=${cells}`);
  const mines = (src.match(/class="rd f13">\*/g) || []).length;
  ok('exactly 11 mines flagged', mines === 11, `mines=${mines}`);
  // Every adjacency number must be 1..8 and labelled with a defined colour class.
  const nums = [...src.matchAll(/class="(bl|gr|rd|yl) f13">(\d)</g)].map((m) => Number(m[2]));
  ok('all adjacency labels are 1-3', nums.length > 0 && nums.every((n) => n >= 1 && n <= 3),
    `labels=${nums.join('')}`);
  ok('no adjacency label exceeds 3', !/>[4-9]<\/text>/.test(src));
}

console.log('\n== terminal line content ==');
{
  const src = fs.readFileSync(path.join(DIR, 'scan-terminal-dark.svg'), 'utf8');
  ok('shows an nmap invocation', /nmap/.test(src));
  ok('states the scope is authorised', /authorised/i.test(src));
  ok('escapes angle brackets safely', !/&(?!amp;|lt;|gt;|quot;|#)/.test(src));
  const open = (src.match(/open\s+/g) || []).length;
  ok('lists at least 5 open ports', open >= 5, `open=${open}`);
  // Every rendered line and the cursor must sit inside the 440x260 viewBox.
  const d = new JSDOM(src, { contentType: 'image/svg+xml' });
  let overflow = 0;
  d.window.document.querySelectorAll('text').forEach((el) => {
    const y = parseFloat(el.getAttribute('y') || '0');
    if (y > 258) overflow++;
  });
  ok('no terminal line overflows the frame', overflow === 0, `overflowing=${overflow}`);
}

console.log('\n== matrix rain density ==');
{
  const src = fs.readFileSync(path.join(DIR, 'matrix-rain-dark.svg'), 'utf8');
  const cols = (src.match(/animation:fall /g) || []).length;
  ok('has a dense field of columns', cols >= 25, `cols=${cols}`);
  ok('escapes & < > in glyphs', /&amp;|&lt;|&gt;/.test(src));
}
console.log('\n== wordmark ==');
{
  // The banner draws the name as a 5x7 dot matrix of binary digits. Rebuilding
  // the expected grid here from an independent copy of the font is the only
  // way to catch a glyph that silently renders blank.
  const FONT = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    V: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    Y: ['10001', '10001', '01110', '00100', '00100', '00100', '00100'],
  };
  const NAME = 'BHAVYA';
  const want = [];
  for (let r = 0; r < 7; r++) {
    let row = '';
    for (const [i, ch] of [...NAME].entries()) {
      row += FONT[ch][r] + (i < NAME.length - 1 ? '0' : '');
    }
    want.push(row);
  }
  ok('font covers every letter of the name', [...NAME].every((c) => FONT[c]),
    NAME.split('').filter((c) => !FONT[c]).join(','));

  for (const theme of ['dark', 'light']) {
    const src = fs.readFileSync(path.join(DIR, `${BANNER}-${theme}.svg`), 'utf8');
    ok(`${theme}: names the role`, /ETHICAL HACKER/i.test(src));
    const d = new JSDOM(src, { contentType: 'image/svg+xml' });
    const doc = d.window.document;
    const root = doc.documentElement;
    const vb = (root.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    const vbW = vb[2];
    const vbH = vb[3];

    // The base matrix lives in <defs>; the visible copies are <use> elements.
    const matrixG = doc.querySelector('#wmMatrix');
    ok(`${theme}: matrix is defined once`, !!matrixG);
    const rows = [...matrixG.querySelectorAll('text')].sort((a, b) => num0(a.getAttribute('y')) - num0(b.getAttribute('y')));
    ok(`${theme}: matrix has 7 rows`, rows.length === 7, `rows=${rows.length}`);

    let mismatch = 0;
    rows.forEach((r, i) => {
      if (r.textContent !== want[i]) {
        mismatch++;
        console.log(`        row ${i}: got ${r.textContent} want ${want[i]}`);
      }
    });
    ok(`${theme}: dot matrix spells BHAVYA`, mismatch === 0, `${mismatch} row(s) differ`);

    // Every pixel must be a binary digit: the "binary" claim is literal.
    const allDigits = rows.map((r) => r.textContent).join('');
    ok(`${theme}: matrix is only 0s and 1s`, /^[01]+$/.test(allDigits));
    ok(`${theme}: matrix has both lit and unlit pixels`, /1/.test(allDigits) && /0/.test(allDigits));

    // The name must be green, and every visible copy must be a <use>.
    ok(`${theme}: digits are palette green`, /\.base\{color:var\(--green\)\}/.test(src));
    ok(`${theme}: lit and unlit digits differ in opacity`, /\.bin0\{fill:currentColor;opacity:\./.test(src));
    // The shared matrix lives in <defs> and is cloned by every <use>. A colour
    // declared on that template would beat the inherited per-layer colour and
    // silently turn the red/cyan aberration green.
    ok(`${theme}: shared matrix declares no colour of its own`,
      !/\.grid\s*\{[^}]*color\s*:/.test(src) && !/id="wmMatrix"[^>]*\scolor=/.test(src));
    const uses = (src.match(/<use href="#wmMatrix"/g) || []).length;
    ok(`${theme}: glitch layers reuse the matrix via <use>`, uses >= 6, `uses=${uses}`);

    // Geometry: the grid must be horizontally centred, and letter-spacing (not
    // an assumed cell width) is what sets the digit pitch. The advance is read
    // back off the element so the check cannot drift from the real font size.
    const spacing = num0(rows[0].getAttribute('letter-spacing'));
    const cellSize = num0((rows[0].getAttribute('class') || '').match(/f(\d+)/)?.[1]);
    const advance = cellSize * 0.6;
    const gridW = rows[0].textContent.length * advance
      + (rows[0].textContent.length - 1) * spacing;
    const x0 = num0(rows[0].getAttribute('x'));
    ok(`${theme}: font size class is present`, cellSize > 0, `class="${rows[0].getAttribute('class')}"`);
    ok(`${theme}: letter-spacing sets the pitch`, spacing > 0, `ls=${spacing}`);
    // A wide gap between digits is what made the letters read as scattered
    // dots, so the gap has to stay small relative to the glyph.
    ok(`${theme}: cells are dense enough to read as letters`,
      spacing < advance * 0.5, `gap=${spacing} advance=${advance.toFixed(1)}`);
    ok(`${theme}: grid is horizontally centred`, Math.abs(x0 - (vbW - gridW) / 2) < 2,
      `x0=${x0} expected=${((vbW - gridW) / 2).toFixed(1)} width=${gridW.toFixed(0)}`);
    ok(`${theme}: grid fits inside the banner`, x0 >= 0 && x0 + gridW <= vbW,
      `${x0.toFixed(0)}..${(x0 + gridW).toFixed(0)} of ${vbW}`);
    ok(`${theme}: banner has a sane aspect`, vbW / vbH > 3.5 && vbW / vbH < 6,
      `ratio=${(vbW / vbH).toFixed(2)}`);

    // Rows must be evenly pitched or the glyphs shear. pitch > 0 matters: with
    // every row sharing one baseline the spacing looks even but is not.
    const ys = rows.map((r) => num0(r.getAttribute('y')));
    const pitch = ys[1] - ys[0];
    ok(`${theme}: rows are evenly pitched`, pitch > 0 && ys.every((y, i) => Math.abs(y - (ys[0] + i * pitch)) < 0.5),
      `pitch=${pitch} ys=${ys.join(',')}`);

    // Everything below the grid has to stay on the card.
    const bits = doc.querySelector('.bits');
    ok(`${theme}: ascii row is below the grid`, !!bits && num0(bits.getAttribute('y')) > ys[6],
      bits ? num0(bits.getAttribute('y')) : 'absent');
    ok(`${theme}: role line is the last element`,
      num0(doc.querySelector('text[letter-spacing="3"]').getAttribute('y')) < vbH,
      `y=${doc.querySelector('text[letter-spacing="3"]').getAttribute('y')} of ${vbH}`);

    // Glitch construction: base, chromatic split, slice tears.
    ok(`${theme}: has red and cyan aberration layers`,
      /\.red-group\{color:var\(--red\)\}/.test(src) && /\.cyan-group\{color:var\(--cyan\)\}/.test(src));
    ok(`${theme}: aberration is animated`, /@keyframes aberration/.test(src));
    const sliceBands = (src.match(/<clipPath id="wmS\d+"><rect/g) || []).length;
    ok(`${theme}: has 4+ slice bands`, sliceBands >= 4, `bands=${sliceBands}`);
    ok(`${theme}: slices are animated`, /@keyframes slice/.test(src));
    const delays = [...src.matchAll(/\.r(\d)\{animation-delay:([\d.]+)s\}/g)].map((m) => Number(m[2]));
    ok(`${theme}: slices are desynchronised`, new Set(delays).size === delays.length && delays.length > 1,
      delays.join(','));
    const cycle = num0((src.match(/animation:slice ([\d.]+)s/) || [])[1]);
    ok(`${theme}: slice delays fall inside the cycle`, cycle > 0 && delays.every((x) => x >= 0 && x < cycle),
      `cycle=${cycle} delays=${delays.join(',')}`);
    const bandYs = [...src.matchAll(/<clipPath id="wmS\d+"><rect x="0" y="([\d.]+)"[^>]*height="([\d.]+)"/g)]
      .map((m) => ({ y: num0(m[1]), h: num0(m[2]) }))
      .sort((a, b) => a.y - b.y);
    let overlap = 0;
    for (let i = 1; i < bandYs.length; i++) if (bandYs[i].y < bandYs[i - 1].y + bandYs[i - 1].h) overlap++;
    ok(`${theme}: slice bands do not overlap`, overlap === 0, bandYs.map((b) => `${b.y}+${b.h}`).join(' '));
    ok(`${theme}: slice bands sit on the grid`, bandYs.every((b) => b.y >= ys[0] - 20 && b.y < ys[6]),
      bandYs.map((b) => b.y).join(','));

    // ids and references must resolve, and stay unique.
    const ids = new Set([...src.matchAll(/<(?:linearGradient|clipPath)\s+id="([^"]+)"/g)].map((m) => m[1]));
    ids.add('wmMatrix');
    const refs = [...src.matchAll(/(?:url\(#|href="#)([^)"]+)/g)].map((m) => m[1]);
    const dangling = refs.filter((r) => !ids.has(r));
    ok(`${theme}: no dangling references`, dangling.length === 0, dangling.join(','));
    ok(`${theme}: ids are unique`, ids.size === [...src.matchAll(/\sid="/g)].length,
      `declared=${ids.size} total=${[...src.matchAll(/\sid="/g)].length}`);

    // Marquee: tiled and clipped, with travel equal to the tile pitch.
    ok(`${theme}: marquee is animated`, /@keyframes marquee/.test(src));
    ok(`${theme}: marquee is clipped`, /wmStripClip/.test(src));
    const travel = (src.match(/@keyframes marquee\{0%\{transform:translateX\(0\)\}100%\{transform:translateX\((-?[\d.]+)px\)\}\}/) || [])[1];
    const xs = [...src.matchAll(/<text x="(-?[\d.]+)" y="22"[^>]*class="f11"/g)].map((m) => num0(m[1]));
    const stripPitch = xs.length >= 2 ? xs[1] - xs[0] : 0;
    ok(`${theme}: marquee has 3 tiled copies`, xs.length >= 3, `copies=${xs.length}`);
    ok(`${theme}: marquee travel equals tile pitch`,
      !!travel && Math.abs(Math.abs(Number(travel)) - stripPitch) < 0.5,
      `travel=${travel} pitch=${stripPitch.toFixed(1)}`);

    // The ASCII row must still decode to the name.
    const expected = [...NAME].map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
    ok(`${theme}: ascii row encodes BHAVYA`, src.includes(expected));
    ok(`${theme}: has falling binary columns`, (src.match(/class="f11 rain"/g) || []).length >= 20);

    // Reduced motion must reach every layer.
    const rm = src.match(/@media\s*\(prefers-reduced-motion:reduce\)\{([^}]*)\}/);
    ok(`${theme}: reduced-motion is a blanket override`, !!rm && /\*\{/.test(rm[1]), rm ? rm[1] : 'absent');
  }

  // The binary claim means what it says: no harsh hex anywhere in the banner.
  for (const theme of ['dark', 'light']) {
    const src = fs.readFileSync(path.join(DIR, `${BANNER}-${theme}.svg`), 'utf8');
    const hexes = [...src.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0].toUpperCase());
    const harsh = hexes.filter((h) => ['#FF0000', '#00FF00', '#FF00FF', '#FFFF00'].includes(h));
    ok(`${theme}: banner avoids harsh colours`, harsh.length === 0, harsh.join(','));
  }
}

console.log('\n== forensics dump ==');
{
  const src = fs.readFileSync(path.join(DIR, 'forensics-dump-dark.svg'), 'utf8');
  ok('shows a hex dump with offsets', /7FFB0000/.test(src));
  ok('mentions memory forensics tooling', /vol\.py|memory\.raw/.test(src));
  ok('carves a named artifact', /carved/i.test(src) && /mimikatz\.exe/.test(src));
  ok('shows a hash for chain of custody', /sha256/.test(src));
  const rows = (src.match(/animation:dumpIn/g) || []).length;
  ok('renders multiple dump rows', rows >= 8, `rows=${rows}`);
  // The plant string is ASCII, so the hex column and the offset column must
  // stay inside the card or the highlight lands off the edge. x is the left
  // edge only for start-anchored text, so the anchor has to be accounted for.
  const d = new JSDOM(src, { contentType: 'image/svg+xml' });
  let minX = Infinity;
  let maxX = -Infinity;
  d.window.document.querySelectorAll('text').forEach((el) => {
    const x = num0(el.getAttribute('x'));
    const w = el.textContent.length * 11 * 0.6;
    const anchor = el.getAttribute('text-anchor') || 'start';
    const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, left + w);
  });
  ok('hex columns stay inside the card', maxX < 440 - 4, `maxTextRight=${maxX.toFixed(0)}`);
  ok('no text starts left of the card', minX >= 2, `minTextLeft=${minX.toFixed(0)}`);
}

console.log('\n== web assessment ==');
{
  const src = fs.readFileSync(path.join(DIR, 'web-assess-dark.svg'), 'utf8');
  ok('states the scope is authorised', /authorised/i.test(src));
  ok('shows a real finding class', /SQLi/i.test(src));
  ok('grades severity', /cvss/i.test(src));
  ok('offers remediation', /remediation|parameterised/i.test(src));
  // The payload contains quotes and spaces; unescaped markup would break the XML.
  ok('escapes the injected payload', /&apos;|&#39;|' OR/.test(src));
  ok('no raw angle brackets in text', !/>[^<]*<[a-z/]/i.test(src.replace(/<\/?(text|g|rect|line|circle|svg|style|defs|linearGradient|clipPath|stop|g)\b[^>]*>/g, '')));
}

console.log('\n== incident response timeline ==');
{
  const src = fs.readFileSync(path.join(DIR, 'ir-timeline-dark.svg'), 'utf8');
  const times = [...src.matchAll(/class="(?:rd|yl|gr) f11">(\d{2}:\d{2})</g)].map((m) => m[1]);
  ok('has at least 5 timestamped events', times.length >= 5, `events=${times.length}`);
  ok('timestamps increase', times.every((t, i) => i === 0 || t > times[i - 1]), times.join(' '));
  ok('ends in containment', /contained/i.test(src));
  // Alternating labels above/below the axis must not collide.
  const d = new JSDOM(src, { contentType: 'image/svg+xml' });
  const labels = [...d.window.document.querySelectorAll('text')].filter((el) => el.getAttribute('text-anchor') === 'middle');
  let collisions = 0;
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i];
      const b = labels[j];
      if (Math.abs(num0(a.getAttribute('y')) - num0(b.getAttribute('y'))) > 6) continue;
      const ah = (a.textContent.length * 10 * 0.6) / 2;
      const bh = (b.textContent.length * 10 * 0.6) / 2;
      if (Math.abs(num0(a.getAttribute('x')) - num0(b.getAttribute('x'))) < ah + bh) collisions++;
    }
  }
  ok('no overlapping timeline labels', collisions === 0, `collisions=${collisions}`);
}

console.log('\n== tls handshake ==');
{
  const src = fs.readFileSync(path.join(DIR, 'tls-handshake-dark.svg'), 'utf8');
  ok('shows a TLS 1.3 negotiation', /tls1_3|TLS_AES_256_GCM/.test(src));
  ok('shows certificate verification', /cert verified/i.test(src));
  ok('has both endpoints', />you</.test(src) && />srv</.test(src));
  ok('starts locked and resolves to green', /lockColor/.test(src) && /--green/.test(src));
  const msgs = (src.match(/class="msg"/g) || []).length;
  ok('has a multi-step handshake', msgs >= 5, `msgs=${msgs}`);
  // Messages must sit above the endpoint circles, not across them.
  const d = new JSDOM(src, { contentType: 'image/svg+xml' });
  const lines = [...d.window.document.querySelectorAll('line')].map((l) => num0(l.getAttribute('y1')));
  const maxLineY = Math.max(...lines);
  const circleY = [...d.window.document.querySelectorAll('circle')].map((c) => num0(c.getAttribute('cy')));
  const minCircleY = Math.min(...circleY);
  ok('handshake lines clear the endpoints', maxLineY < minCircleY - 18,
    `maxLineY=${maxLineY} minCircleY=${minCircleY}`);
}

console.log('\n== README wiring ==');
{
  const md = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

  // GitHub strips these from README HTML, so a profile-page game is impossible.
  for (const tag of ['script', 'style', 'iframe', 'canvas', 'button', 'input']) {
    ok(`README has no <${tag}>`, !new RegExp(`<${tag}[\\s>/]`, 'i').test(md));
  }

  // Every referenced local asset must be committed.
  const refs = [...new Set([...md.matchAll(/\.\/(games|dist)\/[a-z0-9-]+\.svg/g)].map((m) => m[0]))];
  ok('README references local SVGs', refs.length > 0);
  for (const r of refs) {
    ok(`${r} is committed`, fs.existsSync(path.join(__dirname, '..', r.replace('./', ''))));
  }

  // Each <picture> needs a dark source plus a light <img> fallback, otherwise
  // one colour scheme shows a blank or mismatched card.
  const pictures = [...md.matchAll(/<picture>([\s\S]*?)<\/picture>/g)].map((m) => m[1]);
  ok('every <picture> has a dark source', pictures.every((p) => /prefers-color-scheme:\s*dark/.test(p)));
  ok('every <picture> has an <img> fallback', pictures.every((p) => /<img\b/.test(p)));
  ok('every <img> has descriptive alt text', [...md.matchAll(/<img\b[^>]*>/g)]
    .every((m) => /alt="[^"]{12,}"/.test(m[0])));

  // Captions must sit under the image they describe. Extract each image's scene
  // name and compare with the caption in the following caption row cell.
  const cells = [...md.matchAll(/srcset="\.\/games\/([a-z0-9-]+?)-(?:dark|light)\.svg"/g)]
    .map((m) => m[1])
    .filter((s) => s !== BANNER);
  const caps = [...md.matchAll(/<td align="center"><strong>([a-z0-9-]+)<\/strong>/g)].map((m) => m[1]);
  ok('scene count matches caption count', cells.length === caps.length,
    `images=${cells.length} captions=${caps.length}`);
  cells.forEach((scene, i) => {
    const expected = DISPLAY_NAME[scene];
    ok(`caption "${caps[i]}" matches image "${scene}"`, !!expected && caps[i] === expected,
      `cell ${i} shows ${scene} (expect ${expected}) but is labelled ${caps[i]}`);
  });

  // The caption table and this map must not fall out of sync.
  const declared = new Set(Object.values(DISPLAY_NAME));
  caps.forEach((c) => ok(`caption "${c}" is a known scene`, declared.has(c)));

  // Every generated scene must actually be shown, or art is dead weight.
  for (const [scene] of SCENES) {
    ok(`${scene} appears in the README`, md.includes(`games/${scene}-`));
  }

  // The banner replaces the old ASCII art and must be theme-aware.
  ok('banner is theme-aware', /games\/wordmark-dark\.svg/.test(md) && /games\/wordmark-light\.svg/.test(md));
  ok('banner has descriptive alt text', /alt="[^"]*BHAVYA[^"]*"/i.test(md));
  ok('ASCII banner was removed', !/█|╔═|██/.test(md));
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);