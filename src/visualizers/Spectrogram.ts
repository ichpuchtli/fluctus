import type { AudioFrame } from "../audio/AudioEngine";
import { createCanvas, resizeCanvas } from "./canvas";
import { createSliderControl } from "./controls";
import type { Visualizer, VisualizerHost } from "./types";

export class Spectrogram implements Visualizer {
  id = "spectrogram";
  name = "Spectrogram";
  description = "Scrolling frequency history for seeing pitch, noise, and harmonic structure over time.";

  private canvas = createCanvas();
  private history = document.createElement("canvas");
  private controls = document.createElement("div");
  private context: CanvasRenderingContext2D | null = null;
  private historyContext: CanvasRenderingContext2D | null = null;
  private readout: HTMLElement | null = null;
  private lastColumnAt = 0;
  private speedMs = 32;
  private gain = 1.25;
  private floor = 8;
  private contrast = 1.55;

  constructor() {
    this.controls.className = "adjustment-controls compact-adjustments";
  }

  mount(host: VisualizerHost): void {
    host.title.textContent = this.name;
    this.readout = host.readout;
    host.surface.append(this.canvas, this.controls);
    this.mountControls();
    this.context = resizeCanvas(this.canvas);
    this.resizeHistory();
  }

  resize(): void {
    this.context = resizeCanvas(this.canvas);
    this.resizeHistory();
  }

  render(frame: AudioFrame | null, time: number): void {
    if (!this.context || !this.historyContext) {
      return;
    }

    if (!frame) {
      this.drawEmpty();
      this.setReadout("No source");
      return;
    }

    if (time - this.lastColumnAt > this.speedMs) {
      this.pushColumn(frame);
      this.lastColumnAt = time;
    }

    this.paint(frame);
  }

  destroy(): void {
    this.canvas.remove();
    this.controls.remove();
    this.context = null;
    this.historyContext = null;
    this.readout = null;
    this.lastColumnAt = 0;
  }

  private resizeHistory(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));

    if (this.history.width !== width || this.history.height !== height) {
      this.history.width = width;
      this.history.height = height;
      this.historyContext = this.history.getContext("2d");
      this.historyContext?.fillRect(0, 0, width, height);
    }
  }

  private pushColumn(frame: AudioFrame): void {
    if (!this.historyContext) {
      return;
    }

    const context = this.historyContext;
    const width = this.history.width;
    const height = this.history.height;
    const source = frame.frequencyBytes;

    context.drawImage(this.history, 1, 0, width - 1, height, 0, 0, width - 1, height);

    for (let y = 0; y < height; y += 1) {
      const norm = 1 - y / Math.max(1, height - 1);
      const frequency = 30 * (frame.sampleRate / 2 / 30) ** norm;
      const bin = Math.min(source.length - 1, Math.max(0, Math.floor((frequency / (frame.sampleRate / 2)) * source.length)));
      const rawValue = (source[bin] ?? 0) / 255;
      const value = Math.min(1, Math.max(0, (rawValue - this.floor / 100) * this.gain));
      context.fillStyle = colorForValue(value, norm, this.contrast);
      context.fillRect(width - 1, y, 1, 1);
    }
  }

  private paint(frame: AudioFrame): void {
    if (!this.context) {
      return;
    }

    const context = this.context;
    const rect = this.canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    context.drawImage(this.history, 0, 0, rect.width, rect.height);
    this.drawGrid(context, rect.width, rect.height, frame.sampleRate);

    const centroid = spectralCentroid(frame);
    const rolloff = spectralRolloff(frame, 0.86);
    this.setReadout(
      `Centroid ${Math.round(centroid)} Hz / rolloff ${Math.round(rolloff)} Hz / speed ${this.speedMs}ms / gain ${this.gain.toFixed(1)}x`,
    );
  }

  private drawEmpty(): void {
    if (!this.context) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    this.context.fillStyle = "#07080d";
    this.context.fillRect(0, 0, rect.width, rect.height);
    this.drawStaticGrid(this.context, rect.width, rect.height);
  }

  private drawGrid(context: CanvasRenderingContext2D, width: number, height: number, sampleRate: number): void {
    this.drawStaticGrid(context, width, height);

    context.save();
    context.fillStyle = "rgba(243, 247, 255, 0.64)";
    context.font = "11px IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "left";
    context.textBaseline = "middle";

    for (const frequency of [60, 120, 250, 500, 1000, 2000, 4000, 8000]) {
      if (frequency >= sampleRate / 2) {
        continue;
      }

      const y = frequencyToY(frequency, sampleRate, height);
      context.fillText(formatFrequency(frequency), 10, y - 8);
    }

    context.restore();
  }

  private drawStaticGrid(context: CanvasRenderingContext2D, width: number, height: number): void {
    context.save();
    context.strokeStyle = "rgba(168, 184, 207, 0.15)";
    context.lineWidth = 1;

    for (let x = width; x >= 0; x -= 72) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    context.strokeStyle = "rgba(77, 225, 255, 0.18)";
    for (let y = 0; y <= height; y += height / 8) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    context.restore();
  }

  private setReadout(value: string): void {
    if (this.readout) {
      this.readout.textContent = value;
    }
  }

  private mountControls(): void {
    this.controls.replaceChildren(
      createSliderControl("Speed", 12, 140, 4, this.speedMs, "ms", (value) => {
        this.speedMs = value;
      }),
      createSliderControl("Gain", 50, 500, 5, this.gain * 100, "%", (value) => {
        this.gain = value / 100;
      }),
      createSliderControl("Floor", 0, 45, 1, this.floor, "%", (value) => {
        this.floor = value;
      }),
      createSliderControl("Contrast", 65, 280, 5, this.contrast * 100, "%", (value) => {
        this.contrast = value / 100;
      }),
    );
  }
}

function colorForValue(value: number, frequencyNorm: number, contrast: number): string {
  const lifted = Math.max(0, value) ** contrast;
  const hue = 206 - lifted * 180 + frequencyNorm * 26;
  const saturation = 42 + lifted * 56;
  const lightness = 5 + lifted * 58;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function frequencyToY(frequency: number, sampleRate: number, height: number): number {
  const nyquist = sampleRate / 2;
  const norm = Math.log(frequency / 30) / Math.log(nyquist / 30);
  return height - norm * height;
}

function formatFrequency(frequency: number): string {
  if (frequency >= 1000) {
    return `${frequency / 1000}k`;
  }

  return String(frequency);
}

function spectralCentroid(frame: AudioFrame): number {
  let weighted = 0;
  let total = 0;
  const nyquist = frame.sampleRate / 2;

  for (let index = 0; index < frame.frequencyBytes.length; index += 1) {
    const value = frame.frequencyBytes[index] / 255;
    const frequency = (index / frame.frequencyBytes.length) * nyquist;
    weighted += frequency * value;
    total += value;
  }

  return total > 0 ? weighted / total : 0;
}

function spectralRolloff(frame: AudioFrame, threshold: number): number {
  const nyquist = frame.sampleRate / 2;
  let total = 0;

  for (const value of frame.frequencyBytes) {
    total += value;
  }

  let running = 0;
  for (let index = 0; index < frame.frequencyBytes.length; index += 1) {
    running += frame.frequencyBytes[index];

    if (running >= total * threshold) {
      return (index / frame.frequencyBytes.length) * nyquist;
    }
  }

  return 0;
}
