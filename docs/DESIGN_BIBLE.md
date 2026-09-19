# ATRI Design Bible — v0.1

The visual law of Atori: **the player is the stage; the music is the light.**
Everything flashy must serve playback comprehension. When in doubt, subtract.

## 1. The three skins

| | NEON GACHA (default) | PASTEL DREAMY | CELESTIAL |
|---|---|---|---|
| Mood | Arknights energy, gacha set-pieces | 90s city-pop OVA, dreamy | Night sky, gold leaf, calm luxury |
| Base | `#0b0b12` charcoal | `#faf1ec` cream (light!) | `#0d0f1e` indigo |
| Accents | magenta `#ff2e88` + cyan `#00e5ff` + gold `#ffcf5c` | peach `#ff8fab` + lavender `#9b8cff` | gold `#f5d76e` + stardust `#8ea7ff` |
| Display font | Chakra Petch | M PLUS Rounded 1c | Cormorant Garamond |
| Shader | neon blobs, perspective grid, impact streaks | sunset bands, bokeh rings, grain | starfield twinkle, nebula fbm, moon glow |
| Motion | fast, snappy, shake ×1.0 | slow, soft, shake ×0.12 | cinematic, shake ×0.25 |
| Particles | shards | bokeh | stars |

A skin is **data** (`skins/*.ts`): tokens + motion profile + GLSL body +
particle kind + fonts. No skin may branch UI code. New skins = new files.

## 2. Token layer

All colors/fonts/radii are `--ato-*` CSS custom properties applied on
`:root` by `SkinProvider`, mapped into Tailwind v4 utilities via
`@theme inline` (`bg-ink`, `text-dim`, `text-accent`, `border-line`,
`font-display`, `rounded-ato`…). Components never hardcode hex.

Required tokens: `--ato-bg, panel, panel-2, text, text-dim, accent,
accent-2, gold, border, danger, font-display/body/mono, radius`.

Contrast rule: body text ≥ 4.5:1 against its panel in every skin; dim text
is for metadata only, never for actions.

## 3. Motion system

- **fast (0.18–0.3s)** hovers, presses · **base (0.32–0.55s)** screen
  elements · **slow (0.7–1.1s)** set-pieces (cut-ins, wipes, boot)
- Screen transitions: Director uses `mode="wait"` enter/exit with
  x-slide + skew (expo-out `[0.16, 1, 0.3, 1]`).
- Springs: Motion springs for layout/shared-element; GSAP timelines for
  choreography (boot, cut-in) — never mix loops.
- Frame-driven widgets (seek fill, spectrum, progress line) write
  `transform` imperatively in rAF. No per-frame React state. Ever.
- **Calm mode**: fades only, shader time frozen, cut-ins disabled.
  Defaults from `prefers-reduced-motion`.

## 4. Gacha vocabulary (when to use what)

| Device | Use | Where |
|---|---|---|
| Slash panel (clip-path) | containers, nav marker, buttons | everywhere |
| Cut-in banner | track change announcement | global |
| Impact frame + shake | play/pause, big actions | transport |
| Kinetic type (glitch/rise) | titles on change | Now Playing, boot |
| Holo foil sweep | hover on SSR covers | album tiles |
| Rarity grade | SSR lossless · SR 320 · R 256 · N rest | lists, NP, mini |
| Letterbox/iris | boot only | boot |
| Ticker/vertical JP text | decoration ≤ 40% opacity | rail edge, headers |

FX must never gate comprehension: with eyes closed, every core task
(play, queue, find) must remain obvious.

## 5. Layout grammar

- Desktop-first grid: 208px nav rail · fluid content · 76px mini player.
- Now Playing = fullscreen takeover; shell fades to 0 (pointer-events off).
- Angular cuts point right-to-left (`clip-slash` family); consistent
  16px slash depth, 10px on chips.
- JP micro-labels accompany every major heading (`LIBRARY ライブラリ`).
- Mono type = system/meta voice (paths, bitrates, tickers). Display type =
  expressive voice. Body type = content voice.

## 6. Sound & haptics (planned)

UI SFX are synthesized (WebAudio, no licensed assets), ≤ -18 LUFS, off by
default in calm mode. Every sound has a visual twin; neither is required.

## 7. Performance budgets

- First paint of shell < 1s on mid-range laptop (dev demo library)
- Shader ≤ 1 fullscreen pass, no per-frame allocations
- 10k-track library scroll stays ≥ 55fps (virtualization in Phase 3+)
- FX tiers cap DPR: Ultra 2.0 / High 1.5 / Medium 1.0 / Low 0.66

## 8. Accessibility bar

- Full keyboard path for transport + navigation; visible focus rings
- Calm mode is first-class, not an afterthought
- Icon-only buttons carry `aria-label`/`title`
- Grade colors always paired with text labels or tooltips
