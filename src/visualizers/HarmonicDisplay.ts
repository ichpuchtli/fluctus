import { describePitch } from "../audio/music";
import type { AudioFrame } from "../audio/AudioEngine";
import { clearCanvas, createCanvas, resizeCanvas } from "./canvas";
import { createSliderControl } from "./controls";
import type { Visualizer, VisualizerHost } from "./types";

interface HarmonicBin {
  amplitude: number;
  frequency: number;
  index: number;
}

const harmonicCount = 12;

export class HarmonicDisplay implements Visualizer {
  id = "harmonics";
  name = "Harmonics";
  description = "Fundamental tracking with overtone energy mapped from the live FFT.";

  private canvas = createCanvas();
  private controls = document.createElement("div");
  private context: CanvasRenderingContext2D | null = null;
  private readout: HTMLElement | null = null;
  private smoothed = new Float32Array(harmonicCount);
  private confidenceGate = 0.34;
  private smoothing = 0.78;

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

  render(frame: AudioFrame | null, time: number): void {
    if (!this.context) {
      return;
    }

    const context = this.context;
    const rect = this.canvas.getBoundingClientRect();
    clearCanvas(context, this.canvas, "#07080d");

    this.drawSpectrumGhost(context, rect.width, rect.height, frame);

    if (!frame?.pitch || frame.pitch.confidence < this.confidenceGate) {
      this.drawEmpty(context, rect.width, rect.height);
      this.setReadout(`No fundamental / gate ${Math.round(this.confidenceGate * 100)}%`);
      return;
    }

    const harmonics = this.measureHarmonics(frame);
    this.drawHarmonics(context, rect.width, rect.height, frame, harmonics, time);
    this.updateReadout(frame, harmonics);
  }

  destroy(): void {
    this.canvas.remove();
    this.controls.remove();
    this.context = null;
    this.readout = null;
    this.smoothed.fill(0);
  }

  private measureHarmonics(frame: AudioFrame): HarmonicBin[] {
    const fundamental = frame.pitch?.frequency ?? 0;
    const nyquist = frame.sampleRate / 2;

    return Array.from({ length: harmonicCount }, (_, index) => {
      const harmonicIndex = index + 1;
      const frequency = fundamental * harmonicIndex;
      const amplitude = frequency < nyquist ? this.amplitudeAtFrequency(frame, frequency) : 0;
      this.smoothed[index] = this.smoothed[index] * this.smoothing + amplitude * (1 - this.smoothing);

      return {
        amplitude: this.smoothed[index],
        frequency,
        index: harmonicIndex,
      };
    });
  }

  private amplitudeAtFrequency(frame: AudioFrame, frequency: number): number {
    const binWidth = frame.sampleRate / 2 / frame.frequencyBytes.length;
    const center = Math.round(frequency / binWidth);
    let peak = 0;

    for (let offset = -1; offset <= 1; offset += 1) {
      const value = frame.frequencyBytes[center + offset] ?? 0;
      peak = Math.max(peak, value / 255);
    }

    return Math.min(1, Math.max(0, peak));
  }

  private drawSpectrumGhost(context: CanvasRenderingContext2D, width: number, height: number, frame: AudioFrame | null): void {
    const data = frame?.frequencyBytes;

    if (!data) {
      return;
    }

    const baseY = height - 46;
    const spectrumHeight = Math.max(68, height * 0.18);

    context.save();
    context.strokeStyle = "rgba(77, 225, 255, 0.18)";
    context.lineWidth = 1.4;
    context.beginPath();

    for (let x = 0; x < width; x += 2) {
      const t = x / Math.max(1, width - 1);
      const index = Math.min(data.length - 1, Math.floor(t * t * data.length));
      const value = data[index] / 255;
      const y = baseY - value * spectrumHeight;

      if (x === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    context.stroke();
    context.restore();
  }

  private drawHarmonics(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    frame: AudioFrame,
    harmonics: HarmonicBin[],
    time: number,
  ): void {
    const pitch = frame.pitch;

    if (!pitch) {
      return;
    }

    const note = describePitch(pitch.frequency);
    const top = 86;
    const bottom = height - 82;
    const availableHeight = Math.max(1, bottom - top);
    const gutter = Math.min(74, Math.max(38, width * 0.06));
    const gap = 10;
    const barWidth = Math.max(10, (width - gutter * 2 - gap * (harmonics.length - 1)) / harmonics.length);
    const pulse = 0.5 + Math.sin(time * 0.005) * 0.5;

    context.save();
    context.textAlign = "left";
    context.textBaseline = "top";
    context.fillStyle = "#f3f7ff";
    context.font = "800 52px system-ui, sans-serif";
    context.fillText(`${note.name}${note.octave}`, gutter, 22);

    context.fillStyle = "#a8b8cf";
    context.font = "500 13px 'IBM Plex Mono', ui-monospace, monospace";
    context.fillText(`${pitch.frequency.toFixed(1)} Hz fundamental`, gutter + 150, 48);

    context.strokeStyle = "rgba(255, 198, 41, 0.45)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(gutter, bottom);
    context.lineTo(width - gutter, bottom);
    context.stroke();

    harmonics.forEach((harmonic, index) => {
      const x = gutter + index * (barWidth + gap);
      const intensity = Math.pow(harmonic.amplitude, 0.72);
      const barHeight = Math.max(2, intensity * availableHeight);
      const y = bottom - barHeight;
      const alpha = 0.32 + intensity * 0.62;
      const hueColor = index === 0 ? "255, 198, 41" : index < 4 ? "77, 225, 255" : "224, 92, 255";

      context.fillStyle = `rgba(${hueColor}, ${alpha})`;
      context.fillRect(x, y, barWidth, barHeight);

      context.fillStyle = `rgba(${hueColor}, ${0.08 + pulse * 0.04})`;
      context.fillRect(x - 2, top, barWidth + 4, availableHeight);

      context.fillStyle = "#a8b8cf";
      context.font = "600 11px 'IBM Plex Mono', ui-monospace, monospace";
      context.textAlign = "center";
      context.textBaseline = "top";
      context.fillText(`${harmonic.index}x`, x + barWidth / 2, bottom + 12);

      if (index === 0 || index === 1 || index === 2 || index === 4 || index === 7) {
        context.save();
        context.translate(x + barWidth / 2, y - 10);
        context.rotate(-Math.PI / 2);
        context.textAlign = "left";
        context.fillStyle = "#61708a";
        context.fillText(`${Math.round(harmonic.frequency)} Hz`, 0, 0);
        context.restore();
      }
    });

    context.restore();
  }

  private drawEmpty(context: CanvasRenderingContext2D, width: number, height: number): void {
    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#f3f7ff";
    context.font = "800 46px system-ui, sans-serif";
    context.fillText("No fundamental", width / 2, height / 2 - 22);
    context.fillStyle = "#a8b8cf";
    context.font = "500 14px 'IBM Plex Mono', ui-monospace, monospace";
    context.fillText(`Start demo audio or use the mic / gate ${Math.round(this.confidenceGate * 100)}%`, width / 2, height / 2 + 30);
    context.restore();
  }

  private updateReadout(frame: AudioFrame, harmonics: HarmonicBin[]): void {
    if (!this.readout || !frame.pitch) {
      return;
    }

    const strongest = harmonics
      .filter((harmonic) => harmonic.index > 1)
      .reduce((best, harmonic) => (harmonic.amplitude > best.amplitude ? harmonic : best), harmonics[1] ?? harmonics[0]);
    const note = describePitch(frame.pitch.frequency);

    this.readout.textContent = `${note.name}${note.octave} / strongest overtone ${strongest.index}x / ${Math.round(strongest.amplitude * 100)}% / smooth ${Math.round(this.smoothing * 100)}%`;
  }

  private setReadout(value: string): void {
    if (this.readout) {
      this.readout.textContent = value;
    }
  }

  private mountControls(): void {
    this.controls.replaceChildren(
      createSliderControl("Gate", 5, 98, 1, this.confidenceGate * 100, "%", (value) => {
        this.confidenceGate = value / 100;
      }),
      createSliderControl("Smooth", 20, 96, 4, this.smoothing * 100, "%", (value) => {
        this.smoothing = value / 100;
      }),
    );
  }
}
