import type { AudioFrame } from "../audio/AudioEngine";
import { clearCanvas, createCanvas, resizeCanvas } from "./canvas";
import { createSliderControl } from "./controls";
import type { Visualizer, VisualizerHost } from "./types";

export class SpectrumAnalyzer implements Visualizer {
  id = "spectrum";
  name = "Spectrum analyzer";
  description = "FFT energy bands with a logarithmic musical emphasis.";

  private canvas = createCanvas();
  private controls = document.createElement("div");
  private context: CanvasRenderingContext2D | null = null;
  private readout: HTMLElement | null = null;
  private barCount = 96;
  private gain = 1.25;
  private floor = 6;
  private curve = 1.35;

  constructor() {
    this.controls.className = "adjustment-controls compact-adjustments";
  }

  mount(host: VisualizerHost): void {
    host.title.textContent = this.name;
    this.readout = host.readout;
    host.surface.append(this.canvas, this.controls);
    this.mountControls();
    this.context = resizeCanvas(this.canvas);
  }

  resize(): void {
    this.context = resizeCanvas(this.canvas);
  }

  render(frame: AudioFrame | null): void {
    if (!this.context) {
      return;
    }

    const context = this.context;
    const rect = this.canvas.getBoundingClientRect();
    clearCanvas(context, this.canvas, "#07080d");

    if (!frame) {
      this.setReadout("No source");
      return;
    }

    const bars = Math.min(this.barCount, Math.max(12, Math.floor(rect.width / 5)));
    const nyquist = frame.sampleRate / 2;
    let dominantFrequency = 0;
    let dominantValue = 0;

    context.save();

    for (let i = 0; i < bars; i += 1) {
      const lowNorm = i / bars;
      const highNorm = (i + 1) / bars;
      const lowFrequency = 30 * (nyquist / 30) ** lowNorm;
      const highFrequency = 30 * (nyquist / 30) ** highNorm;
      const lowBin = Math.max(0, Math.floor((lowFrequency / nyquist) * frame.frequencyBytes.length));
      const highBin = Math.max(lowBin + 1, Math.floor((highFrequency / nyquist) * frame.frequencyBytes.length));
      let sum = 0;

      for (let bin = lowBin; bin < highBin; bin += 1) {
        const value = frame.frequencyBytes[bin] ?? 0;
        sum += value;

        if (value > dominantValue) {
          dominantValue = value;
          dominantFrequency = (bin / frame.frequencyBytes.length) * nyquist;
        }
      }

      const rawValue = sum / (highBin - lowBin) / 255;
      const value = Math.min(1, Math.max(0, (rawValue - this.floor / 100) * this.gain));
      const barWidth = rect.width / bars;
      const x = i * barWidth;
      const barHeight = Math.max(2, value ** this.curve * rect.height * 0.92);
      const y = rect.height - barHeight;
      const hue = 188 + value * 42;

      context.fillStyle = `hsl(${hue} 95% ${48 + value * 24}%)`;
      context.fillRect(x + 1, y, Math.max(1, barWidth - 2), barHeight);
    }

    context.restore();
    this.setReadout(`Peak ${Math.round(dominantFrequency)} Hz / RMS ${frame.rms.toFixed(3)} / bars ${bars} / gain ${this.gain.toFixed(1)}x`);
  }

  destroy(): void {
    this.canvas.remove();
    this.controls.remove();
    this.context = null;
    this.readout = null;
  }

  private setReadout(value: string): void {
    if (this.readout) {
      this.readout.textContent = value;
    }
  }

  private mountControls(): void {
    this.controls.replaceChildren(
      createSliderControl("Bars", 24, 192, 4, this.barCount, "", (value) => {
        this.barCount = value;
      }),
      createSliderControl("Gain", 50, 400, 5, this.gain * 100, "%", (value) => {
        this.gain = value / 100;
      }),
      createSliderControl("Floor", 0, 40, 1, this.floor, "%", (value) => {
        this.floor = value;
      }),
      createSliderControl("Curve", 55, 260, 5, this.curve * 100, "%", (value) => {
        this.curve = value / 100;
      }),
    );
  }
}
