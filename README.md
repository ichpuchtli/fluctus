# Fluctus

Fluctus is a microphone-driven sound visualization lab built with Web Audio, vanilla TypeScript, and direct rendering APIs.

It starts as an uplift of a simple pitch detector and grows into a collection of functional and artistic utilities: note detection, tuning views, oscilloscopes, FFT displays, spectrograms, chord tools, kaleidoscopes, and nostalgic Winamp-style visualizers.

Current tabs include pitch detection, solfege training, note history, interval detection, chord detection, harmonics, oscilloscope, spectrum analyzer, spectrogram, Sonic Ripple Field, and Cymatic Plate. The pitch detector includes adjustable note hold, display lag, and confidence gate controls so notes remain perceptible without changing the raw audio stream.

## Development

```sh
npm install
npm run dev
```

Build the production app with:

```sh
npm run build
```

Run the browser smoke test with:

```sh
npx playwright install chromium
npm run test:e2e
```

## Deployment

Merges to `master` deploy to GitHub Pages through `.github/workflows/deploy-pages.yml`.

The workflow builds the production app from `master`, publishes `dist/` to the `gh-pages` branch, and GitHub Pages serves that branch at the project URL. The Vite build uses a relative base so it works from `/fluctus/`.

## Direction

- Vanilla TypeScript, direct DOM, Canvas, SVG, and WebGL.
- One shared microphone audio engine.
- Art visualizers use smoothed musical features for slow bass/body motion while keeping raw FFT texture detail available to shaders. `Still`, `Flow`, and `Live` motion controls tune the damping per visualizer.
- Functional tools first, immersive visualizers next.
- `master` is source; GitHub Actions publishes the static `dist/` artifact to Pages.

See [WEBGL_VISUALIZERS.md](./WEBGL_VISUALIZERS.md) for the live shader and fluid-visualization direction.

## Microphone Privacy

Fluctus uses the browser's built-in microphone permission flow. Audio is processed locally in the browser and is not uploaded by the app.

Demo mode is available for visualizer development and use without microphone access.
