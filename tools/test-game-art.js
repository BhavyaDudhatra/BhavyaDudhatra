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
  doc.window.document.querySelectorAll('rect, circle, text, line').forEach((el) => {
    // Full-bleed backgrounds are intentional and fill the card exactly, so
    // they are excluded; this check targets stray content drawn off-card.
    if (el.tagName === 'rect' && num0(el.getAttribute('width')) === vbW) return;
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
        // A stack of <tspan>s repeats the same x and advances by dy, so the
        // real width is one glyph, not the concatenation of every row.
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
  ok(`${name} no content drawn outside the viewBox`, escapes === 0,
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
  const src = fs.readFileSync(path.join(DIR, `${BANNER}-dark.svg`), 'utf8');
  ok('renders the name', />BHAVYA</.test(src));
  ok('names the role', /ETHICAL HACKER/i.test(src));
  // Letter-spacing on centred text is easy to overdo and pushes the glyphs
  // past the viewBox edges.
  const d = new JSDOM(src, { contentType: 'image/svg+xml' });
  const vbW = num0(d.window.document.documentElement.getAttribute('viewBox').split(/\s+/)[2]);
  const size = 66;
  const spacing = 10;
  const width = 'BHAVYA'.length * (size * 0.6) + (('BHAVYA'.length - 1) * spacing);
  ok('wordmark fits its viewBox width', width < vbW, `text=${width.toFixed(0)} viewBox=${vbW}`);
  ok('wordmark is centred', /text-anchor="middle"/.test(src));
  ok('has a gradient sweep', /linearGradient/.test(src) && /animation:sweep/.test(src));
  // Gradient/clip ids are referenced by url(#id); a typo renders as no fill.
  const ids = new Set([...src.matchAll(/<(?:linearGradient|clipPath)\s+id="([^"]+)"/g)].map((m) => m[1]));
  const refs = [...src.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
  const dangling = refs.filter((r) => !ids.has(r));
  ok('no dangling url(#id) references', dangling.length === 0, dangling.join(','));
  ok('ids are unique', ids.size === [...src.matchAll(/id="/g)].length);
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