import { AudioEngine, type AudioEngineState, type AudioFrame } from "./audio/AudioEngine";
import "./styles.css";
import { ChordDetector } from "./visualizers/ChordDetector";
import { CymaticPlate } from "./visualizers/CymaticPlate";
import { HarmonicDisplay } from "./visualizers/HarmonicDisplay";
import { IntervalDetector } from "./visualizers/IntervalDetector";
import { NoteHistory } from "./visualizers/NoteHistory";
import { Oscilloscope } from "./visualizers/Oscilloscope";
import { PitchDetector } from "./visualizers/PitchDetector";
import { Spectrogram } from "./visualizers/Spectrogram";
import { SolfegeTrainer } from "./visualizers/SolfegeTrainer";
import { SonicRippleField } from "./visualizers/SonicRippleField";
import { SpectrumAnalyzer } from "./visualizers/SpectrumAnalyzer";
import type { Visualizer } from "./visualizers/types";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root is missing");
}

const audio = new AudioEngine();
const visualizers: Visualizer[] = [
  new PitchDetector(),
  new SolfegeTrainer(),
  new NoteHistory(),
  new IntervalDetector(),
  new ChordDetector(),
  new HarmonicDisplay(),
  new Oscilloscope(),
  new SpectrumAnalyzer(),
  new Spectrogram(),
  new SonicRippleField(),
  new CymaticPlate(),
];
let activeVisualizer = visualizers[0];
let activeButton: HTMLButtonElement | null = null;
let focusButton: HTMLButtonElement | null = null;

app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <div>
          <h1>Fluctus</h1>
          <p>Sound visualization lab</p>
        </div>
      </div>
      <div class="source-controls" aria-label="Audio source controls">
        <button class="control-button" data-action="mic">Use mic</button>
        <button class="control-button" data-action="demo">Demo</button>
        <button class="control-button" data-action="stop">Stop</button>
      </div>
    </header>

    <section class="status-strip" aria-live="polite">
      <canvas class="rail-canvas" aria-hidden="true"></canvas>
      <div class="status-copy">
        <span class="status-dot" data-status-dot></span>
        <span data-status>Choose a source</span>
      </div>
    </section>

    <section class="workbench">
      <nav class="tabs" aria-label="Visualization utilities" data-tabs></nav>
      <section class="panel" aria-labelledby="visualizer-title">
        <div class="panel-heading">
          <div>
            <h2 id="visualizer-title" data-title></h2>
            <p data-description></p>
          </div>
          <div class="panel-tools">
            <div class="readout" data-readout>No source</div>
            <button class="control-button focus-button" data-action="focus" type="button" aria-label="Enter focus mode">Focus</button>
          </div>
        </div>
        <div class="visual-surface" data-surface></div>
      </section>
    </section>
  </main>
`;

const tabs = query("[data-tabs]");
const title = query("[data-title]");
const description = query("[data-description]");
const readout = query("[data-readout]");
const surface = query("[data-surface]");
const panel = query<HTMLElement>(".panel");
const statusText = query("[data-status]");
const statusDot = query("[data-status-dot]");
const railCanvas = query<HTMLCanvasElement>(".rail-canvas");
focusButton = query<HTMLButtonElement>("[data-action='focus']");

for (const visualizer of visualizers) {
  const button = document.createElement("button");
  button.className = "tab-button";
  button.type = "button";
  button.textContent = visualizer.name;
  button.addEventListener("click", () => activateVisualizer(visualizer, button));
  tabs.append(button);

  if (visualizer === activeVisualizer) {
    activeButton = button;
  }
}

activateVisualizer(activeVisualizer, activeButton);

app.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  const action = target?.closest<HTMLElement>("[data-action]")?.dataset.action;

  if (action === "mic") {
    void audio.startMicrophone();
  }

  if (action === "demo") {
    void audio.startDemo();
  }

  if (action === "stop") {
    void audio.stop();
  }

  if (action === "focus") {
    void toggleFocusMode();
  }
});

audio.addEventListener("statechange", (event) => {
  const state = (event as CustomEvent<AudioEngineState>).detail;
  statusText.textContent = state.message;
  statusDot.dataset.state = state.status;
});

window.addEventListener("resize", () => {
  activeVisualizer.resize();
});

document.addEventListener("fullscreenchange", () => {
  const isFocused = document.fullscreenElement === panel;
  panel.classList.toggle("is-focused", isFocused);

  if (focusButton) {
    focusButton.textContent = isFocused ? "Exit" : "Focus";
    focusButton.setAttribute("aria-label", isFocused ? "Exit focus mode" : "Enter focus mode");
  }

  activeVisualizer.resize();
});

let lastFrame: AudioFrame | null = null;

function loop(time: number): void {
  lastFrame = audio.getFrame();
  activeVisualizer.render(lastFrame, time);
  drawRail(lastFrame);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

function activateVisualizer(visualizer: Visualizer, button: HTMLButtonElement | null): void {
  activeVisualizer.destroy();
  activeVisualizer = visualizer;
  surface.replaceChildren();
  title.textContent = visualizer.name;
  description.textContent = visualizer.description;
  readout.textContent = "No source";
  visualizer.mount({ surface, title, readout });

  if (activeButton) {
    activeButton.setAttribute("aria-selected", "false");
  }

  activeButton = button;

  if (activeButton) {
    activeButton.setAttribute("aria-selected", "true");
  }
}

function drawRail(frame: AudioFrame | null): void {
  const rect = railCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));

  if (railCanvas.width !== width || railCanvas.height !== height) {
    railCanvas.width = width;
    railCanvas.height = height;
  }

  const context = railCanvas.getContext("2d");
  if (!context) {
    return;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);

  if (!frame) {
    context.fillStyle = "rgba(168, 184, 207, 0.16)";
    context.fillRect(0, rect.height / 2 - 1, rect.width, 2);
    return;
  }

  context.strokeStyle = "rgba(77, 225, 255, 0.82)";
  context.lineWidth = 1.5;
  context.beginPath();

  for (let i = 0; i < frame.timeDomain.length; i += 8) {
    const x = (i / (frame.timeDomain.length - 1)) * rect.width;
    const y = rect.height / 2 + frame.timeDomain[i] * rect.height * 0.4;

    if (i === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.stroke();
}

async function toggleFocusMode(): Promise<void> {
  try {
    if (document.fullscreenElement === panel) {
      await document.exitFullscreen();
      return;
    }

    await panel.requestFullscreen({ navigationUI: "hide" });
  } catch {
    statusText.textContent = "Focus mode is unavailable";
    statusDot.dataset.state = "error";
  }
}

function query<T extends Element = HTMLElement>(selector: string): T {
  const element = app?.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}
