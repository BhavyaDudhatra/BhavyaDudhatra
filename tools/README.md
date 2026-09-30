# Profile artwork

The animated banner and the eight cards in the README's **Console** section are
generated SVG, not hand-written. `games/` is committed output; edit the
generator, not the SVGs.

## Scenes

| File | Caption | What it shows |
|:--|:--|:--|
| `wordmark` | banner | The name, with a gradient sweep and periodic glitch |
| `web-assess` | web-assess | Probing a parameter and grading a confirmed SQLi |
| `scan-terminal` | nmap | An authorised port scan typing itself out |
| `forensics-dump` | forensics | A memory hex dump with an artifact carved and hashed |
| `vuln-grid` | vuln-grid | A minesweeper grid standing in for a scan |
| `ir-timeline` | incident-response | Correlated events from brute force to containment |
| `firewall-watch` | packet-filter | Packets passing or being blocked by a WAF |
| `tls-handshake` | tls-handshake | A TLS 1.3 handshake resolving to an encrypted session |
| `matrix-rain` | entropy | The one scene that is purely for show |

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
  clipped. Text width is estimated from the glyph count, honouring
  `text-anchor` — treating a centred label's `x` as its left edge reports
  overflows that are not there and misses ones that are. Full-bleed background
  rects and stacked `<tspan>` columns are exempt.
- **Wrong size.** `width`/`height` must match the `viewBox`, and every card must
  share one size so the README grid stays regular. The banner is checked
  separately for aspect ratio.
- **Dangling `url(#id)`.** A typo in a gradient or clipPath reference renders as
  no fill at all, which looks like a missing colour rather than a broken id.
- **Broken animation wiring.** Every `animation:` name needs a matching
  `@keyframes`, and each scene must respect `prefers-reduced-motion`.
- **Content honesty.** Each scene asserts the specifics that make it read as
  real work: the assessment must claim an authorised scope, the hex dump must
  show an offset column and a hash, the timeline's timestamps must increase.
- **README/image drift.** A caption that no longer matches the image beside it,
  a missing `alt`, a `<picture>` without a light fallback, a local asset that
  was never committed, or a generated scene nobody put on the page.

The suite runs in CI via `.github/workflows/snake.yml`, so a broken commit
cannot reach `main`.
