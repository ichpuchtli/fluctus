# WebGL Visualizers Live Document

This document captures the evolving direction for Fluctus' WebGL and shader-based visualizers. It is meant to be picked up by future agents, models, or engineers without needing the original conversation.

## North Star

Build immersive sound visualizations where microphone audio feels like it is physically touching matter.

The strongest first direction is a liquid or wave-tank surface: sound creates ripples, pressure, shimmer, dye, and flow. Functional tabs can stay precise and instrument-like; WebGL tabs should feel more like live sound sculpture.

## Technical Constraints

- Keep the app vanilla TypeScript.
- Use direct WebGL2 APIs, not Three.js, unless a future feature clearly needs a scene graph.
- Keep the shared `AudioEngine` as the only microphone owner.
- Feed visualizers derived audio frames; do not let shader tabs open their own audio streams.
- Smooth visual audio features before they reach art shaders so fluid/cymatic motion follows musical body rather than raw frame jitter.
- Prefer shader-only effects first, then add multi-pass simulations after the WebGL foundation is stable.
- Every WebGL visualizer must degrade cleanly when WebGL2 is unavailable.

## First WebGL Milestone: Sonic Ripple Field

Goal: ship a convincing sound-reactive liquid surface without implementing a full fluid simulation yet.

Status: first shader-only version implemented. The current tab uses WebGL2, a full-screen fragment shader, shared audio frames, derived bass/mid/treble bands, pitch uniforms, a 1D FFT audio texture, mouse/touch ripple impulses, shader caustics/slope lighting, browser fullscreen focus mode, and `tank` / `ink` / `kaleido` presets. It does not yet use ping-pong framebuffers.

Motion update: art tabs now use a shared `VisualAudioSmoother` that separates slow bass/body envelopes, faster transients, smoothed pitch, and a damped visual timebase. Raw FFT data is still available to shaders through the audio texture for detail, but broad fluid motion is driven by slower musical features. WebGL art tabs expose `Still`, `Flow`, and `Live` controls so damping can be tuned without code changes.

Behavior:

- Render a dark fluid/wave surface.
- Use RMS and peak to create circular ripple impulses.
- Use bass energy for broad displacement.
- Use mids for lateral motion and interference.
- Use treble for fine shimmer.
- Use pitch, when stable, to gently bias ripple spacing, hue, or rotation.
- Use the FFT texture for localized shimmer and frequency-detail sampling inside the shader.
- Use pointer input as a temporary ripple emitter so the surface feels physically touchable.
- Use focus mode for a stage-like fullscreen surface with compact controls.
- Include a few preset modes:
  - `tank`: precise wave-tank look with visible interference.
  - `ink`: softer dye/plume look with color trails.
  - `kaleido`: radial symmetry for a nostalgic media-player feel.

Implemented:

- WebGL helper for context creation, shader compilation, uniform lookup, resize, and teardown.
- Uniform-driven audio input: `rms`, `peak`, `time`, `bass`, `mid`, `treble`, `pitchHz`, `pitchConfidence`.
- 512-sample 1D FFT texture uploaded each frame for shader-side spectral sampling.
- Mouse/touch pointer impulse with decay, exposed as `pointer` and `pointerEnergy` uniforms.
- Shader caustics and slope lighting for a stronger liquid-surface read.
- App-level focus mode using the Fullscreen API.
- Single fragment shader over a full-screen triangle.
- Preset buttons for `tank`, `ink`, and `kaleido`.

Still to add:

- Browser screenshot review and tuning on real microphone input.
- Full Navier-Stokes-style simulation in a later milestone.

Acceptance:

- Runs smoothly on the same app shell as existing tabs.
- Looks compelling in demo mode before microphone permission is granted.
- Shows visible difference between quiet, bass-heavy, noisy, and pitched input.
- Does not break canvas visualizers or recreate the audio stream when switching tabs.

## Later Milestone: Real Fluid Simulation

Once the WebGL pipeline is proven, add ping-pong framebuffers for a real multi-pass simulation.

### Cymatics and Fluid Simulation Direction

Add a dedicated cymatics family of visualizers where sound creates standing waves in simulated matter. This should feel closer to plates, membranes, water, sand, ferrofluid, and resonant tanks than a generic music visualizer.

Candidate modes:

- **Cymatic Plate**: sustained pitch forms nodal line patterns inspired by Chladni plates; RMS controls excitation strength and spectral centroid controls grain/noise breakup. Initial shader tab exists as `CymaticPlate`.
- **Resonant Water Tray**: pitch locks into standing ripples on a shallow fluid surface; bass adds large waves, transients add droplets, and harmonics create secondary interference rings. Initial approximation exists as the `water` mode in `CymaticPlate`.
- **Sand on Membrane**: particles migrate away from high-motion regions and collect along nodal lines; useful as a hybrid WebGL particle + heightfield mode. Initial approximation exists as the `sand` mode in `CymaticPlate`.
- **Ferrofluid Lens**: bass and pitch pull spikes out of a dark reflective fluid; treble adds fine surface instability.

Implementation note: start with shader-only approximations using wave equations and interference fields, then graduate the best idea into the real fluid pipeline below. The first cymatics prototype should prefer visible standing-wave structure over physically complete simulation.

Likely passes:

- Velocity advection.
- Dye advection.
- Divergence.
- Pressure solve.
- Gradient subtraction.
- Audio impulse injection.
- Final render/refraction/composite.

Audio mapping:

- Bass: large pressure pulses and slow fluid pushes.
- Mids: directional flow and vortex injection.
- Treble: surface sparkle, fine ripples, and edge highlights.
- Transients: discrete drops or impacts.
- Stable pitch: standing-wave spacing, hue drift, or symmetry count.
- Spectral centroid: turbulence amount.

Smoothing rules:

- Slow bass/body envelopes should drive large displacement and phase speed.
- Fast transients should create impacts, flashes, droplets, or grain scatter.
- Treble should add surface detail rather than pushing the whole simulation.
- Pitch should be smoothed in log-frequency space and gated by confidence.
- Visual time should advance from smoothed musical drive, not raw wall-clock time.
- `Still`: strongest damping for slow cymatic lock-in and sustained notes.
- `Flow`: default musical response with stable body motion and visible transients.
- `Live`: faster response for percussion, noisy sources, and more reactive demos.

## Visual Concepts Backlog

### Sonic Fluid

A dark liquid surface seen from above. Bass creates broad pressure rings, mids bend the current, treble adds capillary shimmer. Transients drop stones into the surface.

### Standing Wave Tank

Scientific and instrument-like. Sustained tones settle into Chladni-style nodal structures; noisy input breaks them into unstable interference.

### Cymatic Plate

A top-down resonant plate or membrane where pitch determines the nodal pattern, amplitude controls excitation, and the FFT adds subtle instability. This is the most direct path to cymatics before a full fluid solver exists.

### Spectral Ink

Sound injects colored dye into a fluid field. Low frequencies create broad amber/blue plumes; high frequencies create thin cyan/magenta veins. The visual keeps a short motion memory.

### Voice Weather

Audio behaves like atmosphere. RMS drives wind speed, pitch drives wind direction, spectral centroid drives turbulence. The result looks like pressure maps, storm fronts, and aurora flow.

### Kaleidofluid

The same ripple/fluid field sampled through radial symmetry. This is the nostalgic Winamp/Windows Media Player direction without cloning an existing preset engine.

### Frequency Reef

FFT bins build an underwater terrain or coral-like landscape. Fluid flows over the ridges, and sustained sound gradually sculpts the scene.

### Oscilloscope Plasma

Use the time-domain waveform as a signed-distance field or curve mask that disturbs a plasma/ripple shader. This keeps the real waveform visibly connected to the artwork.

## Design Guardrails

- WebGL tabs should be immersive, but controls must remain compact and readable.
- The visual should respond to sound structure, not only volume.
- Prefer a small number of strong presets over many weak knobs.
- Avoid generic neon equalizer looks unless deliberately used as a nostalgic mode.
- Respect reduced-motion preferences where practical by lowering intensity rather than disabling the tab.

## Suggested Build Order

1. Add WebGL helper utilities.
2. Add a basic full-screen shader tab with time and resolution uniforms.
3. Add audio band extraction helpers to derive bass/mid/treble from FFT bins.
4. Build Sonic Ripple Field with uniform-driven ripples.
5. Add preset switching for `tank`, `ink`, and `kaleido`.
6. Add 1D audio textures for richer shader sampling.
7. Add pointer interaction as another ripple source.
8. Add fullscreen focus mode for performance use.
9. Build the first shader-only cymatics tab.
10. Prototype ping-pong framebuffer simulation.
11. Promote the best fluid prototype into a polished tab.
