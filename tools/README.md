# Profile artwork

The four animated cards in the README's **Terminal** section are generated SVG,
not hand-written. `games/` is committed output; edit the generator, not the SVGs.

## Commands

```bash
npm install     # once, pulls jsdom for the test suite
npm run generate   # rewrite games/*.svg
npm test           # validate artwork and README wiring
```

`generate` is driven by a seeded PRNG, so reruns are byte-identical. If an SVG
diff appears without a generator change, something is wrong.

## Themes

Each scene has a `-dark` and `-light` variant. The README selects between them
with `<picture>` and `prefers-color-scheme`, so both are always kept in sync.

## What the test suite catches

`tools/test-game-art.js` guards against mistakes that are invisible in the
source but obvious once rendered:

- **Invalid CSS variables.** `fill="var(--x)"` as an SVG *presentation
  attribute* does not resolve; it must be in `style` or a stylesheet. This once
  blacked out all 66 grid cells.
- **Content escaping the viewBox.** Text and shapes drawn past the card edge get
  clipped. Full-bleed background rects are exempt.
- **Broken animation wiring.** Every `animation:` name needs a matching
  `@keyframes`, and each scene must respect `prefers-reduced-motion`.
- **README/image drift.** A caption that no longer matches the image beside it,
  a missing `alt`, a `<picture>` without a light fallback, or a local asset that
  was never committed.

The suite runs in CI via `.github/workflows/snake.yml`, so a broken commit
cannot reach `main`.
