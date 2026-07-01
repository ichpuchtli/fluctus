import type { AudioFrame } from "../audio/AudioEngine";
import { clearCanvas, createCanvas, resizeCanvas } from "./canvas";
import type { Visualizer, VisualizerHost } from "./types";

export class Oscilloscope implements Visualizer {
  id = "oscilloscope";
  name = "Oscilloscope";
  description = "Time-domain waveform for the active audio source.";

  private canvas = createCanvas();
  private context: CanvasRenderingContext2D | null = null;
  private readout: HTMLElement | null = null;

  mount(host: VisualizerHost): void {
    host.title.textContent = this.name;
    this.readout = host.readout;
    host.surface.append(this.canvas);
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
    this.drawGrid(context, rect.width, rect.height);

    if (!frame) {
      this.setReadout("No source");
      return;
    }

    context.save();
    context.strokeStyle = "#4de1ff";
    context.lineWidth = 2;
    context.beginPath();

    frame.timeDomain.forEach((sample, index) => {
      const x = (index / (frame.timeDomain.length - 1)) * rect.width;
      const y = rect.height / 2 + sample * rect.height * 0.38;

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });

    context.stroke();
    context.restore();
    this.setReadout(`RMS ${frame.rms.toFixed(3)} / peak ${frame.peak.toFixed(3)}`);
  }

  destroy(): void {
    this.canvas.remove();
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
}
