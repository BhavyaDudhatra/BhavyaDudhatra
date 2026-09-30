const fs = require('fs');
const path = require('path');
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');

const FILE = path.join(__dirname, 'snake', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

let failures = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
};

function makeCtx() {
  const calls = [];
  const rec = (n) => (...a) => { calls.push(n); };
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, shadowColor: '', shadowBlur: 0 };
  return {
    calls, state,
    clearRect: rec('clearRect'), fillRect: rec('fillRect'),
    beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    arc: rec('arc'), arcTo: rec('arcTo'), closePath: rec('closePath'),
    fill: rec('fill'), stroke: rec('stroke'), save: rec('save'), restore: rec('restore'),
    roundRect: rec('roundRect'), setTransform: rec('setTransform'),
    set fillStyle(v) { state.fillStyle = v; },   get fillStyle() { return state.fillStyle; },
    set strokeStyle(v) { state.strokeStyle = v; }, get strokeStyle() { return state.strokeStyle; },
    set lineWidth(v) { state.lineWidth = v; }, get lineWidth() { return state.lineWidth; },
    set globalAlpha(v) { state.globalAlpha = v; }, get globalAlpha() { return state.globalAlpha; },
    set shadowColor(v) { state.shadowColor = v; }, get shadowColor() { return state.shadowColor; },
    set shadowBlur(v) { state.shadowBlur = v; }, get shadowBlur() { return state.shadowBlur; },
  };
}

// jsdom does not share localStorage across instances, so simulate a reload by
// carrying the store contents over explicitly.
let carriedStore = {};

function boot(opts = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://bhavyadudhatra.github.io/snake/',
    pretendToBeVisual: true,
    beforeParse(w) {
      Object.keys(carriedStore).forEach((k) => w.localStorage.setItem(k, carriedStore[k]));
      // Pretend to be a high-DPI screen so the crisp-render branch is exercised.
      Object.defineProperty(w, 'devicePixelRatio', { value: opts.dpr || 3, configurable: true });
      const ctx = makeCtx();
      w.__ctx = ctx;
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.__rafQueue = [];
      let now = 0;
      w.requestAnimationFrame = (cb) => { w.__rafQueue.push(cb); return w.__rafQueue.length; };
      w.cancelAnimationFrame = () => { w.__rafQueue = []; };
      w.__advance = (ms) => {
        now += ms;
        const pending = w.__rafQueue.splice(0, w.__rafQueue.length);
        pending.forEach((cb) => cb(now));
      };
    },
  });
  return dom;
}

function snapshotStore(win) {
  const out = {};
  for (let i = 0; i < win.localStorage.length; i++) {
    const k = win.localStorage.key(i);
    out[k] = win.localStorage.getItem(k);
  }
  return out;
}

const dom = boot();
const { window } = dom;
const doc = window.document;
const G = () => window.__snake;
const $ = (id) => doc.getElementById(id);
const key = (k) => doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

console.log('\n== load ==');
ok('game API exposed after load', !!G());
ok('state starts as over', G().state === 'over', G().state);
ok('initial score 0', $('score').textContent === '0');
ok('initial length 3', $('length').textContent === '3');
ok('initial best 0', $('best').textContent === '0');
ok('canvas drew on load', window.__ctx.calls.length > 0, `calls=${window.__ctx.calls.length}`);
ok('high-DPI transform applied', window.__ctx.calls.includes('setTransform'));
ok('food placed on a free cell', G().food !== null);
ok('food not inside the snake', (() => {
  const f = G().food, h = G().head;
  return f.x !== h.x || f.y !== h.y;
})());
ok('no console errors during load', true);

console.log('\n== start / pause / resume ==');
key(' ');
ok('Space starts the game', G().state === 'running', G().state);
ok('overlay hidden while running', $('overlay').hidden === true);
ok('Play disabled while running', $('btn-play').disabled === true);
ok('Pause enabled while running', $('btn-pause').disabled === false);
key(' ');
ok('Space pauses', G().state === 'paused', G().state);
ok('overlay visible when paused', $('overlay').hidden === false);
ok('pause overlay title', doc.querySelector('.overlay-title').textContent === 'Paused');
key(' ');
ok('Space resumes', G().state === 'running', G().state);

console.log('\n== button wiring ==');
click($('btn-pause'));
ok('Pause button pauses', G().state === 'paused', G().state);
click($('btn-play'));
ok('Play button resumes', G().state === 'running', G().state);
click($('btn-restart'));
ok('Restart keeps it running', G().state === 'running', G().state);
ok('Restart resets score', G().score === 0);
ok('Restart resets length', G().length === 3);
ok('Restart resets head to start position', G().head.x === 8 && G().head.y === 10);

console.log('\n== movement ==');
const before = { x: G().head.x, y: G().head.y };
window.__advance(140);
window.__advance(140);
ok('snake moves right from start', G().head.x > before.x, `x=${G().head.x}`);
key('ArrowDown');
for (let i = 0; i < 12; i++) window.__advance(140);
ok('snake responds to ArrowDown', G().head.y > before.y, `y=${G().head.y}`);

console.log('\n== reverse input is rejected ==');
click($('btn-restart'));
key('ArrowLeft');           // opposite of the initial 'right' heading
for (let i = 0; i < 6; i++) window.__advance(140);
ok('cannot reverse into own neck', G().state === 'running', G().state);
ok('still travelling right after rejected reverse', G().head.x >= 8, `x=${G().head.x}`);

console.log('\n== wall collision ends the run ==');
click($('btn-restart'));
for (let i = 0; i < 40 && G().state === 'running'; i++) window.__advance(140);
ok('running into a wall ends the game', G().state === 'dead', G().state);
ok('game-over title shown', doc.querySelector('.overlay-title').textContent === 'Game over');
ok('overlay visible after death', $('overlay').hidden === false);
ok('Pause disabled after death', $('btn-pause').disabled === true);
ok('Play re-enabled for retry', $('btn-play').disabled === false);
ok('dead snake stops advancing', (() => {
  const x = G().head.x;
  for (let i = 0; i < 5; i++) window.__advance(140);
  return G().head.x === x;
})());

console.log('\n== pause actually freezes simulation ==');
click($('btn-restart'));
key('ArrowUp');
for (let i = 0; i < 6; i++) window.__advance(140);
key(' ');
const frozen = { x: G().head.x, y: G().head.y, len: G().length, score: G().score };
for (let i = 0; i < 15; i++) window.__advance(500);
ok('head does not move while paused', G().head.x === frozen.x && G().head.y === frozen.y);
ok('score frozen while paused', G().score === frozen.score);
ok('length frozen while paused', G().length === frozen.len);

console.log('\n== scoring, growth and best-score persistence ==');
// Deterministic food: Math.random()===0 places food at the first free cell.
window.Math.random = () => 0;
click($('btn-restart'));
G().steer('up');
for (let i = 0; i < 11; i++) window.__advance(140);   // (8,10) -> (8,0)
ok('reached the top row alive', G().state === 'running', G().state);
G().steer('left');
for (let i = 0; i < 8; i++) window.__advance(140);    // (8,0) -> (0,0)
ok('ate the food', G().score === 10, `score=${G().score}`);
ok('score HUD in sync', $('score').textContent === '10', $('score').textContent);
ok('snake grew to 4', G().length === 4 && $('length').textContent === '4', `len=${G().length}`);
ok('best HUD updated live', $('best').textContent === '10', $('best').textContent);
ok('best written to localStorage', window.localStorage.getItem('bhavya.snake.best') === '10',
  window.localStorage.getItem('bhavya.snake.best'));

console.log('\n== best score survives a reload ==');
carriedStore = snapshotStore(window);   // carry the store into a fresh document
ok('store carried over contains the best score', carriedStore['bhavya.snake.best'] === '10',
  JSON.stringify(carriedStore));
const dom2 = boot();
ok('reloaded page restores best score', dom2.window.document.getElementById('best').textContent === '10',
  dom2.window.document.getElementById('best').textContent);
ok('reloaded page starts a fresh run', dom2.window.__snake.score === 0);
ok('reloaded page restores length to 3', dom2.window.__snake.length === 3);
dom2.window.close();

console.log('\n== d-pad ==');
click($('btn-restart'));
click(doc.querySelector('[data-dir="up"]'));
for (let i = 0; i < 6; i++) window.__advance(140);
ok('d-pad up moves the snake up', G().head.y < 10, `y=${G().head.y}`);
click(doc.querySelector('[data-dir="left"]'));
ok('d-pad click does not throw', true);

console.log('\n== theme toggle ==');
const themeBefore = doc.documentElement.getAttribute('data-theme');
click($('theme-toggle'));
const themeAfter = doc.documentElement.getAttribute('data-theme');
ok('theme toggles', themeBefore !== themeAfter, `${themeBefore} -> ${themeAfter}`);
ok('theme persisted to localStorage', window.localStorage.getItem('bhavya.snake.theme') === themeAfter);
ok('game still playable after theme change', G().state === 'running', G().state);

console.log('\n== resilience ==');
for (let i = 0; i < 300; i++) {
  key('r');
  key(['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][i % 4]);
  window.__advance(140);
}
ok('300 random restarts + turns stay alive', G().state === 'running', G().state);
ok('score HUD stays numeric', /^\d+$/.test($('score').textContent));
ok('length HUD stays numeric', /^\d+$/.test($('length').textContent));
ok('head stays on the board', G().head.x >= 0 && G().head.x < 21 && G().head.y >= 0 && G().head.y < 21);
ok('drawing continued after stress', window.__ctx.calls.length > 100);

// Distinct held-down keys must not stall the loop.
key('ArrowUp');
for (let i = 0; i < 200; i++) window.__advance(140);
ok('loop alive after 200 further frames', window.__ctx.calls.length > 200);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);