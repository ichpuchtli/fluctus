import type { AudioFrame } from "../audio/AudioEngine";
import { clearCanvas, createCanvas, resizeCanvas } from "./canvas";
import { createSliderControl } from "./controls";
import type { Visualizer, VisualizerHost } from "./types";

export class Oscilloscope implements Visualizer {
  id = "oscilloscope";
  name = "Oscilloscope";
  description = "Time-domain waveform for the active audio source.";

  private canvas = createCanvas();
  private controls = document.createElement("div");
  private context: CanvasRenderingContext2D | null = null;
  private readout: HTMLElement | null = null;
  private gain = 1;
  private thickness = 2;
  private persistence = 0;
  private windowPercent = 100;

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
    if (this.persistence > 0) {
      context.fillStyle = `rgba(7, 8, 13, ${1 - this.persistence})`;
      context.fillRect(0, 0, rect.width, rect.height);
    } else {
      clearCanvas(context, this.canvas, "#07080d");
    }
    this.drawGrid(context, rect.width, rect.height);

    if (!frame) {
      this.setReadout("No source");
      return;
    }

    context.save();
    context.strokeStyle = "#4de1ff";
    context.lineWidth = this.thickness;
    context.beginPath();

    const visibleSamples = Math.max(16, Math.floor(frame.timeDomain.length * (this.windowPercent / 100)));
    const start = Math.max(0, Math.floor((frame.timeDomain.length - visibleSamples) / 2));

    for (let index = 0; index < visibleSamples; index += 1) {
      const sample = frame.timeDomain[start + index] ?? 0;
      const x = (index / (visibleSamples - 1)) * rect.width;
      const y = rect.height / 2 + sample * this.gain * rect.height * 0.38;

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    context.stroke();
    context.restore();
    this.setReadout(
      `RMS ${frame.rms.toFixed(3)} / peak ${frame.peak.toFixed(3)} / gain ${this.gain.toFixed(1)}x / window ${this.windowPercent}%`,
    );
  }

  destroy(): void {
    this.canvas.remove();
    this.controls.remove();
    this.context = null;
    this.readout = null;
  }

  private drawGrid(context: CanvasRenderingContext2D, width: number, height: number): void {
    context.save();
    context.strokeStyle = "rgba(168, 184, 207, 0.14)";
    context.lineWidth = 1;

    for (let y = 0; y <= 4; y += 1) {
      const lineY = (height / 4) * y;
      context.beginPath();
      context.moveTo(0, lineY);
      context.lineTo(width, lineY);
      context.stroke();
    }

    context.strokeStyle = "rgba(255, 198, 41, 0.22)";
    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();
    context.restore();
  }

  private setReadout(value: string): void {
    if (this.readout) {
      this.readout.textContent = value;
    }
  }

  private mountControls(): void {
    this.controls.replaceChildren(
      createSliderControl("Gain", 25, 400, 5, this.gain * 100, "%", (value) => {
        this.gain = value / 100;
      }),
      createSliderControl("Window", 10, 100, 5, this.windowPercent, "%", (value) => {
        this.windowPercent = value;
      }),
      createSliderControl("Trace", 1, 8, 1, this.thickness, "px", (value) => {
        this.thickness = value;
      }),
      createSliderControl("Persist", 0, 92, 2, this.persistence * 100, "%", (value) => {
        this.persistence = value / 100;
      }),
    );
  }
}
