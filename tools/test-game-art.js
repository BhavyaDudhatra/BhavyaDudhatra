'use strict';
/*
 * Validates the generated SVG scenes before they are committed and shown on the
 * profile. Catches the classes of mistake that are invisible in the source but
 * obvious on the rendered page.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');

const DIR = path.join(__dirname, '..', 'games');
const SCENES = [
  ['matrix-rain', 'fall'],
  ['vuln-grid', 'cellCycle'],
  ['scan-terminal', 'lineIn'],
  ['firewall-watch', 'passMove'],
];

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
  doc.window.document.querySelectorAll('rect, circle, text, line').forEach((el) => {
    // Full-bleed backgrounds are intentional and fill the card exactly, so
    // they are excluded; this check targets stray content drawn off-card.
    if (el.tagName === 'rect' && num0(el.getAttribute('width')) === vbW) return;
    const num = (a) => parseFloat(el.getAttribute(a) || '0');
    const x = num('x');
    const y = num('y');
    const w = num('width');
    const h = num('height');
    if (x < -2 || y < -2 || x + w > vbW + 2 || y + h > vbH + 2) escapes++;
  });
  ok(`${name} no content drawn outside the viewBox`, escapes === 0, `offenders=${escapes}`);
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

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);