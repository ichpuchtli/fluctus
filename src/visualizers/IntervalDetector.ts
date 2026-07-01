import { describePitch } from "../audio/music";
import type { AudioFrame } from "../audio/AudioEngine";
import { clearCanvas, createCanvas, resizeCanvas } from "./canvas";
import { createSliderControl } from "./controls";
import type { Visualizer, VisualizerHost } from "./types";

interface LockedPitch {
  frequency: number;
  label: string;
  midi: number;
  time: number;
}

const intervalNames = [
  "unison",
  "minor 2nd",
  "major 2nd",
  "minor 3rd",
  "major 3rd",
  "perfect 4th",
  "tritone",
  "perfect 5th",
  "minor 6th",
  "major 6th",
  "minor 7th",
  "major 7th",
] as const;

export class IntervalDetector implements Visualizer {
  id = "interval";
  name = "Interval detector";
  description = "Lock a root note and see the live interval, cents error, and consonance shape.";

  private canvas = createCanvas();
  private context: CanvasRenderingContext2D | null = null;
  private controls = document.createElement("div");
  private lockButton = document.createElement("button");
  private clearButton = document.createElement("button");
  private readout: HTMLElement | null = null;
  private root: LockedPitch | null = null;
  private latestPitch: LockedPitch | null = null;
  private stableStart = 0;
  private lastStableMidi: number | null = null;
  private confidenceGate = 0.56;
  private lockMs = 420;

  constructor() {
    this.controls.className = "interval-controls interval-adjustments";
    this.lockButton.className = "preset-button";
    this.lockButton.type = "button";
    this.lockButton.textContent = "Lock root";
    this.clearButton.className = "preset-button";
    this.clearButton.type = "button";
    this.clearButton.textContent = "Clear";
    this.controls.append(
      this.lockButton,
      this.clearButton,
      createSliderControl("Gate", 5, 98, 1, this.confidenceGate * 100, "%", (value) => {
        this.confidenceGate = value / 100;
      }),
      createSliderControl("Lock", 120, 1600, 40, this.lockMs, "ms", (value) => {
        this.lockMs = value;
        this.stableStart = 0;
      }),
    );
  }

  mount(host: VisualizerHost): void {
    host.title.textContent = this.name;
    this.readout = host.readout;
    host.surface.append(this.canvas, this.controls);
    this.context = resizeCanvas(this.canvas);

    this.lockButton.addEventListener("click", this.lockCurrentPitch);
    this.clearButton.addEventListener("click", this.clearRoot);
  }

  resize(): void {
    this.context = resizeCanvas(this.canvas);
  }

  render(frame: AudioFrame | null, time: number): void {
    if (!this.context) {
      return;
    }

    const pitch = frame?.pitch;
    this.latestPitch = pitch && pitch.confidence >= this.confidenceGate ? this.toLockedPitch(pitch.frequency, time) : null;
    this.maybeAutoLockRoot(frame, time);

    const context = this.context;
    const rect = this.canvas.getBoundingClientRect();
    clearCanvas(context, this.canvas, "#07080d");

    this.drawGrid(context, rect.width, rect.height);
    this.drawInterval(context, rect.width, rect.height, time);
    this.updateReadout();
  }

  destroy(): void {
    this.lockButton.removeEventListener("click", this.lockCurrentPitch);
    this.clearButton.removeEventListener("click", this.clearRoot);
    this.canvas.remove();
    this.controls.remove();
    this.context = null;
    this.readout = null;
    this.root = null;
    this.latestPitch = null;
    this.stableStart = 0;
    this.lastStableMidi = null;
  }

  private lockCurrentPitch = (): void => {
    if (this.latestPitch) {
      this.root = { ...this.latestPitch };
    }
  };

  private clearRoot = (): void => {
    this.root = null;
    this.stableStart = 0;
    this.lastStableMidi = null;
  };

  private maybeAutoLockRoot(frame: AudioFrame | null, time: number): void {
    if (this.root || !frame?.pitch || frame.pitch.confidence < this.confidenceGate) {
      return;
    }

    const current = describePitch(frame.pitch.frequency);

    if (current.midi !== this.lastStableMidi) {
      this.lastStableMidi = current.midi;
      this.stableStart = time;
      return;
    }

    if (time - this.stableStart > this.lockMs) {
      this.root = this.toLockedPitch(frame.pitch.frequency, time);
    }
  }

  private toLockedPitch(frequency: number, time: number): LockedPitch {
    const note = describePitch(frequency);
    return {
      frequency,
      label: `${note.name}${note.octave}`,
      midi: note.midi,
      time,
    };
  }

  private drawGrid(context: CanvasRenderingContext2D, width: number, height: number): void {
    context.save();
    context.strokeStyle = "rgba(168, 184, 207, 0.12)";
    context.lineWidth = 1;

    const cx = width / 2;
    const cy = height / 2 + 22;
    const radius = Math.min(width, height) * 0.34;

    for (let i = 0; i < 12; i += 1) {
      const angle = -Math.PI / 2 + (i / 12) * Math.PI * 2;
      const x1 = cx + Math.cos(angle) * (radius - 14);
      const y1 = cy + Math.sin(angle) * (radius - 14);
      const x2 = cx + Math.cos(angle) * (radius + 10);
      const y2 = cy + Math.sin(angle) * (radius + 10);
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    }

    context.strokeStyle = "rgba(77, 225, 255, 0.18)";
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(cx, cy, radius * 0.58, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = "#61708a";
    context.font = "600 11px 'IBM Plex Mono', ui-monospace, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";

    for (let i = 0; i < 12; i += 1) {
      const angle = -Math.PI / 2 + (i / 12) * Math.PI * 2;
      const x = cx + Math.cos(angle) * (radius + 30);
      const y = cy + Math.sin(angle) * (radius + 30);
      context.fillText(`${i}`, x, y);
    }

    context.restore();
  }

  private drawInterval(context: CanvasRenderingContext2D, width: number, height: number, time: number): void {
    const cx = width / 2;
    const cy = height / 2 + 22;
    const radius = Math.min(width, height) * 0.34;

    context.save();

    if (!this.root) {
      this.drawEmpty(context, width, height, "Sing or play one stable note", "The first held note becomes the root");
      context.restore();
      return;
    }

    if (!this.latestPitch) {
      this.drawEmpty(context, width, height, this.root.label, "Root locked. Waiting for the next pitch");
      this.drawNode(context, cx, cy - radius, "#ffc629", "root");
      context.restore();
      return;
    }

    const analysis = this.analyzeInterval(this.root, this.latestPitch);
    const rootX = cx;
    const rootY = cy - radius;
    const targetAngle = -Math.PI / 2 + (analysis.simpleSemitones / 12) * Math.PI * 2;
    const targetX = cx + Math.cos(targetAngle) * radius;
    const targetY = cy + Math.sin(targetAngle) * radius;
    const pulse = 0.5 + Math.sin(time * 0.006) * 0.5;

    context.strokeStyle = `rgba(255, 198, 41, ${0.38 + pulse * 0.18})`;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(rootX, rootY);
    context.quadraticCurveTo(cx, cy, targetX, targetY);
    context.stroke();

    context.strokeStyle = this.consonanceColor(analysis.simpleSemitones, 0.74);
    context.lineWidth = 9;
    context.beginPath();
    context.arc(cx, cy, radius * 0.78, -Math.PI / 2, targetAngle, analysis.simpleSemitones > 6);
    context.stroke();

    this.drawNode(context, rootX, rootY, "#ffc629", "root");
    this.drawNode(context, targetX, targetY, this.consonanceColor(analysis.simpleSemitones, 1), "live");

    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#f3f7ff";
    context.font = "800 48px system-ui, sans-serif";
    context.fillText(analysis.name, cx, cy - 26);

    context.fillStyle = this.consonanceColor(analysis.simpleSemitones, 1);
    context.font = "700 22px 'IBM Plex Mono', ui-monospace, monospace";
    context.fillText(analysis.centsText, cx, cy + 26);

    context.fillStyle = "#a8b8cf";
    context.font = "500 13px 'IBM Plex Mono', ui-monospace, monospace";
    context.fillText(`${this.root.label} -> ${this.latestPitch.label} / ${analysis.direction}`, cx, cy + 58);

    context.restore();
  }

  private drawEmpty(context: CanvasRenderingContext2D, width: number, height: number, headline: string, detail: string): void {
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#f3f7ff";
    context.font = "800 44px system-ui, sans-serif";
    context.fillText(headline, width / 2, height / 2 - 24);
    context.fillStyle = "#a8b8cf";
    context.font = "500 14px 'IBM Plex Mono', ui-monospace, monospace";
    context.fillText(detail, width / 2, height / 2 + 28);
  }

  private drawNode(context: CanvasRenderingContext2D, x: number, y: number, color: string, label: string): void {
    context.fillStyle = "rgba(7, 8, 13, 0.84)";
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, 23, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.fillStyle = color;
    context.font = "700 10px 'IBM Plex Mono', ui-monospace, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, x, y);
  }

  private analyzeInterval(root: LockedPitch, current: LockedPitch): {
    centsText: string;
    direction: string;
    name: string;
    simpleSemitones: number;
  } {
    const exactSemitones = 12 * Math.log2(current.frequency / root.frequency);
    const nearestSemitones = Math.round(exactSemitones);
    const cents = Math.round((exactSemitones - nearestSemitones) * 100);
    const simpleSemitones = ((nearestSemitones % 12) + 12) % 12;
    const octaveCount = Math.floor(Math.abs(nearestSemitones) / 12);
    const baseName = intervalNames[simpleSemitones];
    const octaveText = octaveCount > 0 && simpleSemitones === 0 ? `${octaveCount} octave${octaveCount > 1 ? "s" : ""}` : baseName;
    const direction = nearestSemitones < 0 ? "descending" : nearestSemitones > 0 ? "ascending" : "level";
    const centsText = cents > 0 ? `+${cents}c` : `${cents}c`;

    return {
      centsText,
      direction,
      name: octaveText,
      simpleSemitones,
    };
  }

  private consonanceColor(semitones: number, alpha: number): string {
    if ([0, 5, 7].includes(semitones)) {
      return `rgba(109, 242, 162, ${alpha})`;
    }

    if ([3, 4, 8, 9].includes(semitones)) {
      return `rgba(77, 225, 255, ${alpha})`;
    }

    if (semitones === 6) {
      return `rgba(224, 92, 255, ${alpha})`;
    }

    return `rgba(255, 198, 41, ${alpha})`;
  }

  private updateReadout(): void {
    if (!this.readout) {
      return;
    }

    if (!this.root) {
      this.readout.textContent = `No root locked / gate ${Math.round(this.confidenceGate * 100)}% / lock ${this.lockMs} ms`;
      return;
    }

    if (!this.latestPitch) {
      this.readout.textContent = `${this.root.label} root / waiting / gate ${Math.round(this.confidenceGate * 100)}%`;
      return;
    }

    const analysis = this.analyzeInterval(this.root, this.latestPitch);
    this.readout.textContent = `${this.root.label} -> ${this.latestPitch.label} / ${analysis.name} / ${analysis.centsText}`;
  }
}
