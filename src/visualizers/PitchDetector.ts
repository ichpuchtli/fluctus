import { describePitch } from "../audio/music";
import type { AudioFrame } from "../audio/AudioEngine";
import { clearCanvas, createCanvas, resizeCanvas } from "./canvas";
import { createSliderControl } from "./controls";
import type { Visualizer, VisualizerHost } from "./types";

interface PitchPoint {
  frequency: number;
  time: number;
}

interface DetectorSettings {
  holdMs: number;
  lag: number;
  confidenceGate: number;
}

export class PitchDetector implements Visualizer {
  id = "pitch";
  name = "Pitch detector";
  description = "Live note, cents offset, confidence, and frequency trail.";

  private canvas = createCanvas();
  private controls = document.createElement("div");
  private context: CanvasRenderingContext2D | null = null;
  private readout: HTMLElement | null = null;
  private points: PitchPoint[] = [];
  private settings: DetectorSettings = {
    holdMs: 1600,
    lag: 0.68,
    confidenceGate: 0.32,
  };
  private displayFrequency = 0;
  private displayConfidence = 0;
  private displayNoteKey = "";
  private pendingPitch: { frequency: number; confidence: number; noteKey: string; since: number } | null = null;
  private lastAcceptedAt = 0;

  constructor() {
    this.controls.className = "adjustment-controls";
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

    const rawPitch = frame?.pitch ?? null;
    const pitch = this.updateDisplayedPitch(rawPitch, time);

    if (pitch) {
      this.points.push({ frequency: pitch.frequency, time });
    }

    this.points = this.points.filter((point) => time - point.time < 8000);

    this.drawTrail(context, rect.width, rect.height, time);

    if (!pitch) {
      this.drawCentered(context, rect.width, rect.height, "?", "Waiting for a stable pitch", "#7f8da8");
      this.setReadout(`No stable note / hold ${this.settings.holdMs} ms`);
      return;
    }

    const note = describePitch(pitch.frequency);
    const centsText = note.cents > 0 ? `+${note.cents}` : `${note.cents}`;
    this.drawCentered(
      context,
      rect.width,
      rect.height,
      `${note.name}${note.octave}`,
      `${Math.round(pitch.frequency)} Hz / ${centsText} cents / ${Math.round(pitch.confidence * 100)}% / hold ${this.settings.holdMs} ms / lag ${Math.round(this.settings.lag * 100)}%`,
      "#f3f7ff",
    );
    this.setReadout(
      `${note.name}${note.octave} / ${pitch.frequency.toFixed(1)} Hz / ${centsText} cents / lag ${Math.round(this.settings.lag * 100)}% / gate ${Math.round(this.settings.confidenceGate * 100)}%`,
    );
  }

  destroy(): void {
    this.canvas.remove();
    this.controls.remove();
    this.points = [];
    this.context = null;
    this.readout = null;
    this.displayFrequency = 0;
    this.displayConfidence = 0;
    this.displayNoteKey = "";
    this.pendingPitch = null;
    this.lastAcceptedAt = 0;
  }

  private drawTrail(context: CanvasRenderingContext2D, width: number, height: number, time: number): void {
    if (this.points.length < 2) {
      return;
    }

    context.save();
    context.strokeStyle = "rgba(77, 225, 255, 0.8)";
    context.lineWidth = 2;
    context.beginPath();

    this.points.forEach((point, index) => {
      const x = width - ((time - point.time) / 8000) * width;
      const logFrequency = Math.log2(Math.max(55, Math.min(1760, point.frequency)) / 55) / 5;
      const y = height - 48 - logFrequency * (height - 96);

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });

    context.stroke();
    context.restore();
  }

  private drawCentered(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    note: string,
    detail: string,
    color: string,
  ): void {
    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = color;
    const noteSize = Math.max(80, Math.min(230, width * 0.22));
    context.font = `700 ${noteSize}px system-ui, sans-serif`;
    context.fillText(note, width / 2, height / 2 - 18);
    context.fillStyle = "#a8b8cf";
    context.font = "500 16px 'IBM Plex Mono', ui-monospace, monospace";
    context.fillText(detail, width / 2, height / 2 + 108);
    context.restore();
  }

  private setReadout(value: string): void {
    if (this.readout) {
      this.readout.textContent = value;
    }
  }

  private updateDisplayedPitch(
    pitch: AudioFrame["pitch"],
    time: number,
  ): { frequency: number; confidence: number } | null {
    if (!pitch || pitch.confidence < this.settings.confidenceGate) {
      return this.ageDisplayedPitch(time);
    }

    const note = describePitch(pitch.frequency);
    const noteKey = `${note.name}${note.octave}`;
    const shouldAcceptImmediately = !this.displayNoteKey || noteKey === this.displayNoteKey;
    const dwellElapsed = time - this.lastAcceptedAt >= this.settings.holdMs;

    if (shouldAcceptImmediately || dwellElapsed) {
      this.acceptPitch(pitch.frequency, pitch.confidence, noteKey, time);
    } else {
      this.pendingPitch = updatePendingPitch(this.pendingPitch, pitch.frequency, pitch.confidence, noteKey, time);
    }

    if (this.pendingPitch && time - this.pendingPitch.since >= this.settings.holdMs && this.pendingPitch.confidence >= this.settings.confidenceGate) {
      this.acceptPitch(this.pendingPitch.frequency, this.pendingPitch.confidence, this.pendingPitch.noteKey, time);
      this.pendingPitch = null;
    }

    return this.ageDisplayedPitch(time);
  }

  private acceptPitch(frequency: number, confidence: number, noteKey: string, time: number): void {
    if (this.displayFrequency === 0) {
      this.displayFrequency = frequency;
    }

    const lag = this.settings.lag;
    this.displayFrequency = this.displayFrequency * lag + frequency * (1 - lag);
    this.displayConfidence = confidence;
    this.displayNoteKey = noteKey;
    this.lastAcceptedAt = time;
  }

  private ageDisplayedPitch(time: number): { frequency: number; confidence: number } | null {
    if (!this.displayNoteKey || time - this.lastAcceptedAt > this.settings.holdMs * 1.8) {
      return null;
    }

    const age = Math.max(0, time - this.lastAcceptedAt);
    const fade = 1 - age / (this.settings.holdMs * 1.8);
    return {
      frequency: this.displayFrequency,
      confidence: this.displayConfidence * Math.max(0.25, fade),
    };
  }

  private mountControls(): void {
    this.controls.replaceChildren(
      createSliderControl("Hold", 250, 4000, 250, this.settings.holdMs, "ms", (value) => {
        this.settings.holdMs = value;
      }),
      createSliderControl("Lag", 0, 96, 4, this.settings.lag * 100, "%", (value) => {
        this.settings.lag = value / 100;
      }),
      createSliderControl("Gate", 5, 98, 1, this.settings.confidenceGate * 100, "%", (value) => {
        this.settings.confidenceGate = value / 100;
      }),
    );
  }
}

function updatePendingPitch(
  pendingPitch: { frequency: number; confidence: number; noteKey: string; since: number } | null,
  frequency: number,
  confidence: number,
  noteKey: string,
  time: number,
): { frequency: number; confidence: number; noteKey: string; since: number } {
  if (!pendingPitch || pendingPitch.noteKey !== noteKey) {
    return { frequency, confidence, noteKey, since: time };
  }

  return {
    frequency: pendingPitch.frequency * 0.72 + frequency * 0.28,
    confidence: Math.max(pendingPitch.confidence, confidence),
    noteKey,
    since: pendingPitch.since,
  };
}
