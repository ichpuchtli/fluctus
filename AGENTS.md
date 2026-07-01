# AGENTS.md

## Mission

Fluctus is a fast, microphone-driven sound visualization lab. It should feel like a serious musical instrument and a small visual performance system: accurate enough for tuning and note work, expressive enough for full-screen sound art.

## Architecture Rules

- Use vanilla TypeScript, direct DOM, Canvas, SVG, and WebGL APIs. Do not add React or a UI framework unless the project direction explicitly changes.
- Keep one shared audio engine. Visualizers consume shared analyser snapshots and must not open their own microphone streams.
- Prefer Canvas 2D for real-time visualizations. Use SVG for durable vector overlays and WebGL2 for heavier artistic or preset-style visuals.
- Keep visualization modules isolated. A tab should implement `mount`, `resize`, `render`, and `destroy`.
- Keep music and signal math in testable modules under `src/audio/`; visualizers should render derived frame data, not duplicate analysis logic.
- Keep dependencies minimal. Add third-party audio libraries only when they clearly improve quality or unlock a feature that would be costly to maintain.

## UX Direction

- The first screen is the tool collection, not a landing page.
- The visual identity is an instrument lab: dark, precise, stage-like, and data-legible.
- Controls should be compact and predictable. Visualizers should own the main surface.
- Include usable states for microphone unavailable, permission denied, and demo mode.
- Respect reduced motion where practical, especially for decorative shell animation.

## Development

- Run `npm run dev` for local development.
- Run `npm run build` before handing off changes.
- Run `npm run test:e2e` for the Playwright smoke test. If Playwright browsers are missing, run `npx playwright install chromium`.
- Keep GitHub Pages deployment output separate from source. `master` is the source branch; `gh-pages` is for deployment.

## Current Milestone

- Vite + vanilla TypeScript foundation.
- Shared microphone/demo audio engine.
- Tabbed utility shell.
- Pitch detector, oscilloscope, and spectrum analyzer.
