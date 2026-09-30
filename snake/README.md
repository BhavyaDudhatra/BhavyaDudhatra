# 🐍 Snake

A dependency-free Snake game that runs in any modern browser. Single HTML file, no build step, no framework, no network calls.

## Play it

**[bhavyadudhatra.github.io/snake](https://bhavyadudhatra.github.io/snake/)**

Or run it locally:

```bash
# from the repo root
python -m http.server 8000
# then open http://localhost:8000/snake/
```

Opening `snake/index.html` directly with `file://` also works.

## Controls

| Action | Input |
|---|---|
| Move | Arrow keys or `W` `A` `S` `D` |
| Pause / resume | `Space` |
| Restart | `R` |
| Move (touch) | Swipe the board, or use the on-screen D-pad |

Walls and your own tail end the run. Your best score is stored in `localStorage` per browser. Reversing directly into your own neck is rejected, so you can't kill yourself with a single keypress.

## Features

- Canvas rendering with a high-DPI transform, so it stays sharp on retina screens
- Light and dark themes, following the OS preference and toggled manually
- Progressive speed increase as you eat, floored so it stays playable
- Keyboard, pointer, and touch-swipe input
- `localStorage` for best score and theme choice
- Respects `prefers-color-scheme` and is keyboard accessible via real `<button>` elements

## Files

```
snake/index.html    the entire game (markup, styles, logic)
test-snake.js       behavioural test suite
```

## Tests

```bash
npm install jsdom
node test-snake.js
```

The suite drives the real page through a JSDOM window with a stubbed canvas
context and a controllable `requestAnimationFrame` clock, so it exercises actual
game ticks rather than mocking the game logic. It covers boot state, start/pause/
resume, button wiring, movement, reverse-input rejection, wall collision, freeze
while paused, scoring and growth, `localStorage` persistence across a simulated
reload, the touch D-pad, the theme toggle, and a 300-iteration stress run.