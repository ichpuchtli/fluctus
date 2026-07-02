# Fluctus Roadmap

## Phase 1: Foundation

- Modern vanilla TypeScript app with Vite.
- Shared Web Audio engine for microphone and demo sources.
- App shell with utility tabs and audio status controls.
- Uplifted pitch detector from the legacy app.
- Pitch detector adjustment controls for note hold, display lag, and confidence gate.
- Solfege trainer for do re mi fa so la ti do practice with movable root, octave, confidence gate, tolerance, hold, and damping controls.
- Note history, interval detection, chord detection, harmonic/overtone display, oscilloscope, spectrum analyzer, and spectrogram.
- Every current tab exposes at least one meaningful control surface. Analysis views now include waveform gain/window/persistence, FFT bar/gain/floor/curve, and spectrogram speed/gain/floor/contrast controls.

## Phase 2: Functional Tools

- Voice and instrument range helper.
- Keep extending adjustment controls across every utility view as new detection or visual tradeoffs appear.
- Expand solfege training with generated target tones, call-and-response phrases, minor/modal scales, and session scoring.

## Phase 3: Artistic Visualizers

- Sonic Ripple Field WebGL tab. Initial shader-only version exists with FFT texture sampling, pointer ripple impulses, shader caustics, fullscreen focus mode, and drive/texture/touch controls; next step is browser screenshot tuning and a later real fluid simulation.
- Cymatics visualizer family: Chladni-style plates, resonant water trays, sand-on-membrane particle modes, and fluid standing-wave simulations. Initial WebGL Cymatic Plate tab exists with plate, water, and sand modes driven by pitch, FFT bands, pointer excitation, and excite/grain/touch controls.
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
