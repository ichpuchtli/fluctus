# Fluctus Roadmap

## Phase 1: Foundation

- Modern vanilla TypeScript app with Vite.
- Shared Web Audio engine for microphone and demo sources.
- App shell with utility tabs and audio status controls.
- Uplifted pitch detector from the legacy app.
- Pitch detector adjustment controls for note hold, display lag, and confidence gate.
- Solfege trainer for do re mi fa so la ti do practice with movable root, confidence gate, tolerance, and hold controls.
- Note history, interval detection, chord detection, harmonic/overtone display, oscilloscope, spectrum analyzer, and spectrogram.

## Phase 2: Functional Tools

- Voice and instrument range helper.
- Add meaningful adjustment controls across every utility view, starting from the pitch detector pattern.
- Expand solfege training with generated target tones, call-and-response phrases, minor/modal scales, and session scoring.

## Phase 3: Artistic Visualizers

- Sonic Ripple Field WebGL tab. Initial shader-only version exists with FFT texture sampling, pointer ripple impulses, shader caustics, and fullscreen focus mode; next step is browser screenshot tuning and a later real fluid simulation.
- Cymatics visualizer family: Chladni-style plates, resonant water trays, sand-on-membrane particle modes, and fluid standing-wave simulations. Initial WebGL Cymatic Plate tab exists with plate, water, and sand modes driven by pitch, FFT bands, and pointer excitation.
- Kaleidoscope/radial symmetry visualizer.
- Particle field driven by RMS and frequency bands.
- Lissajous and phase-style visualizer.
- Liquid waveform and smoke-style canvas modes.
- Full-screen performance mode. Initial app-wide focus mode exists.

## Phase 4: Nostalgic Presets

- First-party Winamp and Windows Media Player inspired modes.
- Palette and preset browser.
- Optional Butterchurn/MilkDrop tab behind WebGL2 capability detection.

## Technical Notes

- Native Web Audio `AnalyserNode` is the core data source.
- Pitch detection starts with the legacy autocorrelation algorithm, isolated for future replacement.
- Broader audio features such as spectral centroid or rolloff can be introduced when art modes need them.
- Artistic shader tabs use a shared visual-audio smoothing layer so bass/body motion is damped, transients stay expressive, and pitch changes move in musical log-frequency space. WebGL art tabs now expose `Still`, `Flow`, and `Live` motion controls.
- WebGL and fluid-simulation ideas live in [WEBGL_VISUALIZERS.md](./WEBGL_VISUALIZERS.md).
