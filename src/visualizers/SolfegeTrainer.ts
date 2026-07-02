import { describePitch, frequencyFromNoteNumber, noteNames } from "../audio/music";
import type { AudioFrame } from "../audio/AudioEngine";
import { clearCanvas, createCanvas, resizeCanvas } from "./canvas";
import { createSelectControl, createSliderControl } from "./controls";
import type { Visualizer, VisualizerHost } from "./types";

type Direction = "ascending" | "descending" | "random";

interface Degree {
  interval: number;
  name: string;
}

const degrees: Degree[] = [
  { name: "do", interval: 0 },
  { name: "re", interval: 2 },
  { name: "mi", interval: 4 },
  { name: "fa", interval: 5 },
  { name: "so", interval: 7 },
  { name: "la", interval: 9 },
  { name: "ti", interval: 11 },
  { name: "do", interval: 12 },
];

const rootOptions = noteNames.map((name, index) => ({ label: name, value: String(index) }));
const octaveOptions = [1, 2, 3, 4, 5, 6].map((octave) => ({ label: String(octave), value: String(octave) }));
const directionOptions: Array<{ label: string; value: Direction }> = [
  { label: "Up", value: "ascending" },
  { label: "Down", value: "descending" },
  { label: "Random", value: "random" },
];

export class SolfegeTrainer implements Visualizer {
  id = "solfege";
  name = "Solfege trainer";
  description = "Practice do re mi fa so la ti do against live microphone pitch.";

  private canvas = createCanvas();
  private controls = document.createElement("div");
  private context: CanvasRenderingContext2D | null = null;
  private readout: HTMLElement | null = null;
  private rootPitchClass = 0;
  private rootOctave = 4;
  private targetIndex = 0;
  private direction: Direction = "ascending";
  private confidenceGate = 0.32;
  private toleranceCents = 35;
  private holdMs = 520;
  private damping = 0.72;
  private hitStartedAt = 0;
  private streak = 0;
  private attempts = 0;
  private hits = 0;
  private smoothedFrequency = 0;
  private smoothedConfidence = 0;

  constructor() {
    this.controls.className = "adjustment-controls solfege-controls";
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

    const pitch = this.smoothPitch(frame?.pitch ?? null);
    const target = this.targetMidi();
    const cents = pitch ? Math.round(1200 * Math.log2(pitch.frequency / frequencyFromNoteNumber(target))) : null;
    const isHit = cents !== null && Math.abs(cents) <= this.toleranceCents;

    if (isHit) {
      if (this.hitStartedAt === 0) {
        this.hitStartedAt = time;
      }

      if (time - this.hitStartedAt >= this.holdMs) {
        this.advanceTarget();
      }
    } else {
      this.hitStartedAt = 0;
    }

    this.draw(context, rect.width, rect.height, pitch, cents, time);
    this.updateReadout(pitch, cents);
  }

  destroy(): void {
    this.canvas.remove();
    this.controls.remove();
    this.context = null;
    this.readout = null;
    this.hitStartedAt = 0;
  }

  private draw(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    pitch: AudioFrame["pitch"],
    cents: number | null,
    time: number,
  ): void {
    const centerX = width / 2;
    const top = 78;
    const rowGap = Math.min(70, Math.max(46, (height - 190) / degrees.length));
    const target = degrees[this.targetIndex];
    const targetMidi = this.targetMidi();
    const currentNote = pitch ? describePitch(pitch.frequency) : null;
    const progress = this.hitStartedAt > 0 ? Math.min(1, (time - this.hitStartedAt) / this.holdMs) : 0;

    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";

    context.fillStyle = "#f3f7ff";
    context.font = "900 64px system-ui, sans-serif";
    context.fillText(target.name, centerX, 46);

    context.fillStyle = "#a8b8cf";
    context.font = "600 13px 'IBM Plex Mono', ui-monospace, monospace";
    context.fillText(
      `${noteNames[this.rootPitchClass]} movable do / target ${noteNames[targetMidi % 12]}${Math.floor(targetMidi / 12) - 1}`,
      centerX,
      96,
    );

    const railX = centerX - Math.min(360, width * 0.36);
    const railWidth = Math.min(720, width * 0.72);
    const xStep = railWidth / (degrees.length - 1);

    context.strokeStyle = "rgba(168, 184, 207, 0.16)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(railX, top + rowGap * 3.5);
    context.lineTo(railX + railWidth, top + rowGap * 3.5);
    context.stroke();

    degrees.forEach((degree, index) => {
      const x = railX + xStep * index;
      const y = top + rowGap * 3.5;
      const isTarget = index === this.targetIndex;

      context.fillStyle = isTarget ? "rgba(255, 198, 41, 0.95)" : "rgba(77, 225, 255, 0.18)";
      context.beginPath();
      context.arc(x, y, isTarget ? 34 : 22, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = isTarget ? "#07080d" : "#f3f7ff";
      context.font = `${isTarget ? "900 22px" : "800 14px"} system-ui, sans-serif`;
      context.fillText(degree.name, x, y);

      context.fillStyle = "#61708a";
      context.font = "600 11px 'IBM Plex Mono', ui-monospace, monospace";
      context.fillText(noteNames[(this.rootPitchClass + degree.interval) % 12], x, y + 46);
    });

    const meterY = height - 118;
    const meterWidth = Math.min(520, width * 0.64);
    const meterX = centerX - meterWidth / 2;
    context.strokeStyle = "rgba(168, 184, 207, 0.22)";
    context.lineWidth = 1;
    context.strokeRect(meterX, meterY, meterWidth, 20);
    context.fillStyle = "rgba(109, 242, 162, 0.22)";
    const toleranceWidth = (this.toleranceCents / 100) * meterWidth;
    context.fillRect(centerX - toleranceWidth / 2, meterY, toleranceWidth, 20);

    if (cents !== null) {
      const clamped = Math.max(-100, Math.min(100, cents));
      const x = centerX + (clamped / 200) * meterWidth;
      context.fillStyle = Math.abs(cents) <= this.toleranceCents ? "#6df2a2" : "#ffc629";
      context.fillRect(x - 3, meterY - 12, 6, 44);
    }

    context.fillStyle = "#a8b8cf";
    context.font = "600 13px 'IBM Plex Mono', ui-monospace, monospace";
    const live = currentNote ? `${currentNote.name}${currentNote.octave} / ${cents ?? 0}c` : "waiting";
    context.fillText(`${live} / hold ${Math.round(progress * 100)}% / streak ${this.streak}`, centerX, height - 66);
    context.restore();
  }

  private advanceTarget(): void {
    this.hitStartedAt = 0;
    this.streak += 1;
    this.hits += 1;
    this.attempts += 1;

    if (this.direction === "descending") {
      this.targetIndex = this.targetIndex === 0 ? degrees.length - 1 : this.targetIndex - 1;
      return;
    }

    if (this.direction === "random") {
      const next = Math.floor(Math.random() * degrees.length);
      this.targetIndex = next === this.targetIndex ? (next + 1) % degrees.length : next;
      return;
    }

    this.targetIndex = (this.targetIndex + 1) % degrees.length;
  }

  private targetMidi(): number {
    return 12 * (this.rootOctave + 1) + this.rootPitchClass + degrees[this.targetIndex].interval;
  }

  private updateReadout(pitch: AudioFrame["pitch"], cents: number | null): void {
    if (!this.readout) {
      return;
    }

    const target = degrees[this.targetIndex];
    const accuracy = this.attempts > 0 ? Math.round((this.hits / this.attempts) * 100) : 0;
    const live = pitch ? `${pitch.frequency.toFixed(1)} Hz / ${cents ?? 0}c` : "waiting";
    this.readout.textContent = `${target.name} octave ${this.rootOctave} / ${live} / streak ${this.streak} / ${accuracy}%`;
  }

  private mountControls(): void {
    this.controls.replaceChildren(
      createSelectControl("Root", rootOptions, String(this.rootPitchClass), (value) => {
        this.rootPitchClass = Number(value);
        this.resetRun();
      }),
      createSelectControl("Octave", octaveOptions, String(this.rootOctave), (value) => {
        this.rootOctave = Number(value);
        this.resetRun();
      }),
      createSelectControl("Mode", directionOptions, this.direction, (value) => {
        this.direction = value;
        this.resetRun();
      }),
      createSliderControl("Gate", 5, 98, 1, this.confidenceGate * 100, "%", (value) => {
        this.confidenceGate = value / 100;
      }),
      createSliderControl("Tol", 8, 80, 2, this.toleranceCents, "c", (value) => {
        this.toleranceCents = value;
      }),
      createSliderControl("Hold", 120, 1600, 40, this.holdMs, "ms", (value) => {
        this.holdMs = value;
      }),
      createSliderControl("Damp", 0, 92, 2, this.damping * 100, "%", (value) => {
        this.damping = value / 100;
        this.smoothedFrequency = 0;
        this.smoothedConfidence = 0;
      }),
    );
  }

  private resetRun(): void {
    this.targetIndex = this.direction === "descending" ? degrees.length - 1 : 0;
    this.hitStartedAt = 0;
    this.streak = 0;
    this.attempts = 0;
    this.hits = 0;
    this.smoothedFrequency = 0;
    this.smoothedConfidence = 0;
  }

  private smoothPitch(pitch: AudioFrame["pitch"]): AudioFrame["pitch"] {
    if (!pitch || pitch.confidence < this.confidenceGate) {
      this.smoothedConfidence *= this.damping;
      if (this.smoothedConfidence < this.confidenceGate * 0.72) {
        this.smoothedFrequency = 0;
        return null;
      }

      return this.smoothedFrequency > 0
        ? {
            frequency: this.smoothedFrequency,
            confidence: this.smoothedConfidence,
          }
        : null;
    }

    if (this.smoothedFrequency <= 0) {
      this.smoothedFrequency = pitch.frequency;
      this.smoothedConfidence = pitch.confidence;
    } else {
      const currentCents = 1200 * Math.log2(this.smoothedFrequency);
      const nextCents = 1200 * Math.log2(pitch.frequency);
      const mixedCents = currentCents * this.damping + nextCents * (1 - this.damping);
      this.smoothedFrequency = 2 ** (mixedCents / 1200);
      this.smoothedConfidence = this.smoothedConfidence * this.damping + pitch.confidence * (1 - this.damping);
    }

    return {
      frequency: this.smoothedFrequency,
      confidence: this.smoothedConfidence,
    };
  }
}
