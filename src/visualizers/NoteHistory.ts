import { centsOffFromPitch, describePitch, frequencyFromNoteNumber, noteNames } from "../audio/music";
import type { AudioFrame } from "../audio/AudioEngine";
import { clearCanvas, createCanvas, resizeCanvas } from "./canvas";
import { createSliderControl } from "./controls";
import type { Visualizer, VisualizerHost } from "./types";

interface NoteSample {
  cents: number;
  confidence: number;
  frequency: number;
  midi: number;
  time: number;
}

const historyMs = 16000;
const minFrequency = 55;
const maxFrequency = 1760;
const centsRange = 60;

export class NoteHistory implements Visualizer {
  id = "note-history";
  name = "Note history";
  description = "Scrolling tuning drift, note locks, and pitch stability over time.";

  private canvas = createCanvas();
  private controls = document.createElement("div");
  private context: CanvasRenderingContext2D | null = null;
  private readout: HTMLElement | null = null;
  private samples: NoteSample[] = [];
  private lastSampleTime = 0;
  private confidenceGate = 0.42;
  private sampleIntervalMs = 38;

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

    this.captureSample(frame, time);
    this.samples = this.samples.filter((sample) => time - sample.time < historyMs);

    this.drawStage(context, rect.width, rect.height, time);
    this.drawSamples(context, rect.width, rect.height, time);
    this.drawCurrent(context, rect.width, frame);
    this.updateReadout(frame);
  }

  destroy(): void {
    this.canvas.remove();
    this.controls.remove();
    this.context = null;
    this.readout = null;
    this.samples = [];
    this.lastSampleTime = 0;
  }

  private captureSample(frame: AudioFrame | null, time: number): void {
    const pitch = frame?.pitch;

    if (!pitch || pitch.confidence < this.confidenceGate || time - this.lastSampleTime < this.sampleIntervalMs) {
      return;
    }

    const midi = this.noteForStableDisplay(pitch.frequency);

    this.samples.push({
      cents: centsOffFromPitch(pitch.frequency, midi),
      confidence: pitch.confidence,
      frequency: pitch.frequency,
      midi,
      time,
    });
    this.lastSampleTime = time;
  }

  private drawStage(context: CanvasRenderingContext2D, width: number, height: number, time: number): void {
    const plot = this.plotBounds(width, height);

    context.save();
    context.fillStyle = "rgba(3, 5, 10, 0.62)";
    context.fillRect(plot.x, plot.y, plot.width, plot.height);

    context.strokeStyle = "rgba(168, 184, 207, 0.12)";
    context.lineWidth = 1;

    for (let i = 0; i <= 8; i += 1) {
      const x = plot.x + (i / 8) * plot.width;
      context.beginPath();
      context.moveTo(x, plot.y);
      context.lineTo(x, plot.y + plot.height);
      context.stroke();
    }

    for (const cents of [-50, -25, 0, 25, 50]) {
      const y = this.yForCents(cents, plot);
      context.strokeStyle = cents === 0 ? "rgba(255, 198, 41, 0.58)" : "rgba(168, 184, 207, 0.14)";
      context.beginPath();
      context.moveTo(plot.x, y);
      context.lineTo(plot.x + plot.width, y);
      context.stroke();
    }

    context.fillStyle = "#61708a";
    context.font = "500 11px 'IBM Plex Mono', ui-monospace, monospace";
    context.textAlign = "right";
    context.textBaseline = "middle";
    context.fillText("+50c", plot.x - 10, this.yForCents(50, plot));
    context.fillText("0", plot.x - 10, this.yForCents(0, plot));
    context.fillText("-50c", plot.x - 10, this.yForCents(-50, plot));

    context.textAlign = "center";
    context.textBaseline = "top";
    for (let i = 0; i <= 4; i += 1) {
      const age = (historyMs / 4) * (4 - i);
      const x = plot.x + (i / 4) * plot.width;
      context.fillText(age === 0 ? "now" : `-${Math.round(age / 1000)}s`, x, plot.y + plot.height + 12);
    }

    this.drawNoteRuler(context, plot, time);
    context.restore();
  }

  private drawNoteRuler(context: CanvasRenderingContext2D, plot: DOMRect, time: number): void {
    const recent = this.samples.filter((sample) => time - sample.time < 3000);
    const centerMidi = recent.length > 0 ? Math.round(recent.reduce((sum, sample) => sum + sample.midi, 0) / recent.length) : 69;

    context.textAlign = "left";
    context.textBaseline = "middle";
    context.font = "600 12px 'IBM Plex Mono', ui-monospace, monospace";

    for (let midi = centerMidi - 4; midi <= centerMidi + 4; midi += 1) {
      const target = frequencyFromNoteNumber(midi);
      if (target < minFrequency || target > maxFrequency) {
        continue;
      }

      const label = `${noteNames[midi % 12]}${Math.floor(midi / 12) - 1}`;
      const shade = midi === centerMidi ? "rgba(77, 225, 255, 0.18)" : "rgba(77, 225, 255, 0.055)";
      const y = plot.y + 18 + ((midi - (centerMidi - 4)) / 8) * (plot.height - 36);

      context.fillStyle = shade;
      context.fillRect(plot.x, y - 13, plot.width, 26);
      context.fillStyle = midi === centerMidi ? "#4de1ff" : "#61708a";
      context.fillText(label, plot.x + 12, y);
    }
  }

  private drawSamples(context: CanvasRenderingContext2D, width: number, height: number, time: number): void {
    const plot = this.plotBounds(width, height);

    if (this.samples.length < 2) {
      return;
    }

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";

    let previous: NoteSample | null = null;

    for (const sample of this.samples) {
      const x = plot.x + plot.width - ((time - sample.time) / historyMs) * plot.width;
      const y = this.yForCents(sample.cents, plot);

      if (previous) {
        const previousX = plot.x + plot.width - ((time - previous.time) / historyMs) * plot.width;
        const previousY = this.yForCents(previous.cents, plot);
        const confidence = Math.min(sample.confidence, previous.confidence);

        context.strokeStyle = this.colorForCents(sample.cents, confidence);
        context.lineWidth = 1.5 + confidence * 2.4;
        context.beginPath();
        context.moveTo(previousX, previousY);
        context.lineTo(x, y);
        context.stroke();
      }

      previous = sample;
    }

    for (const sample of this.samples.slice(-48)) {
      const x = plot.x + plot.width - ((time - sample.time) / historyMs) * plot.width;
      const y = this.yForCents(sample.cents, plot);
      context.fillStyle = this.colorForCents(sample.cents, sample.confidence);
      context.beginPath();
      context.arc(x, y, 1.8 + sample.confidence * 2.5, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }

  private drawCurrent(context: CanvasRenderingContext2D, width: number, frame: AudioFrame | null): void {
    const pitch = frame?.pitch;
    const panelWidth = Math.min(330, Math.max(230, width * 0.34));
    const x = width - panelWidth - 20;
    const y = 20;

    context.save();
    context.fillStyle = "rgba(7, 8, 13, 0.78)";
    context.strokeStyle = "rgba(168, 184, 207, 0.18)";
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(x, y, panelWidth, 122, 8);
    context.fill();
    context.stroke();

    if (!pitch) {
      context.fillStyle = "#7f8da8";
      context.font = "700 52px system-ui, sans-serif";
      context.textAlign = "left";
      context.textBaseline = "top";
      context.fillText("?", x + 18, y + 15);
      context.font = "500 13px 'IBM Plex Mono', ui-monospace, monospace";
      context.fillText(`waiting / gate ${Math.round(this.confidenceGate * 100)}%`, x + 18, y + 84);
      context.restore();
      return;
    }

    const note = describePitch(pitch.frequency);
    const cents = note.cents > 0 ? `+${note.cents}` : `${note.cents}`;
    const stability = this.stabilityScore();

    context.fillStyle = "#f3f7ff";
    context.font = "800 54px system-ui, sans-serif";
    context.textAlign = "left";
    context.textBaseline = "top";
    context.fillText(`${note.name}${note.octave}`, x + 18, y + 12);

    context.fillStyle = this.colorForCents(note.cents, pitch.confidence);
    context.font = "700 20px 'IBM Plex Mono', ui-monospace, monospace";
    context.fillText(`${cents}c`, x + 150, y + 31);

    context.fillStyle = "#a8b8cf";
    context.font = "500 13px 'IBM Plex Mono', ui-monospace, monospace";
    context.fillText(`${pitch.frequency.toFixed(1)} Hz`, x + 20, y + 86);
    context.fillText(`${Math.round(stability)}% stable / gate ${Math.round(this.confidenceGate * 100)}%`, x + 150, y + 86);
    context.restore();
  }

  private updateReadout(frame: AudioFrame | null): void {
    if (!this.readout) {
      return;
    }

    const pitch = frame?.pitch;

    if (!pitch) {
      this.readout.textContent = `No stable note / gate ${Math.round(this.confidenceGate * 100)}%`;
      return;
    }

    const note = describePitch(pitch.frequency);
    const cents = note.cents > 0 ? `+${note.cents}` : `${note.cents}`;
    const recent = this.recentSamples(2200);
    const averageCents = recent.length
      ? recent.reduce((sum, sample) => sum + sample.cents, 0) / recent.length
      : note.cents;
    const averageText = averageCents > 0 ? `+${averageCents.toFixed(1)}` : averageCents.toFixed(1);

    this.readout.textContent = `${note.name}${note.octave} / ${cents}c now / ${averageText}c avg / rate ${this.sampleIntervalMs} ms`;
  }

  private mountControls(): void {
    this.controls.replaceChildren(
      createSliderControl("Gate", 5, 98, 1, this.confidenceGate * 100, "%", (value) => {
        this.confidenceGate = value / 100;
      }),
      createSliderControl("Rate", 16, 180, 4, this.sampleIntervalMs, "ms", (value) => {
        this.sampleIntervalMs = value;
      }),
    );
  }

  private plotBounds(width: number, height: number): DOMRect {
    return new DOMRect(58, 44, Math.max(1, width - 86), Math.max(1, height - 104));
  }

  private yForCents(cents: number, plot: DOMRect): number {
    const clamped = Math.max(-centsRange, Math.min(centsRange, cents));
    return plot.y + plot.height * 0.5 - (clamped / centsRange) * plot.height * 0.5;
  }

  private colorForCents(cents: number, confidence: number): string {
    const distance = Math.min(1, Math.abs(cents) / 50);
    const alpha = 0.35 + confidence * 0.55;

    if (distance < 0.18) {
      return `rgba(109, 242, 162, ${alpha})`;
    }

    if (distance < 0.58) {
      return `rgba(255, 198, 41, ${alpha})`;
    }

    return `rgba(255, 107, 107, ${alpha})`;
  }

  private stabilityScore(): number {
    const recent = this.recentSamples(1800);

    if (recent.length < 4) {
      return 0;
    }

    const averageError = recent.reduce((sum, sample) => sum + Math.abs(sample.cents), 0) / recent.length;
    return Math.max(0, Math.min(100, 100 - averageError * 2));
  }

  private recentSamples(ageMs: number): NoteSample[] {
    const newest = this.samples.at(-1)?.time ?? 0;
    return this.samples.filter((sample) => newest - sample.time <= ageMs);
  }

  private noteForStableDisplay(frequency: number): number {
    const latest = this.samples.at(-1);

    if (!latest) {
      return describePitch(frequency).midi;
    }

    const centsFromLatest = centsOffFromPitch(frequency, latest.midi);

    if (Math.abs(centsFromLatest) < 58) {
      return latest.midi;
    }

    return describePitch(frequency).midi;
  }
}
