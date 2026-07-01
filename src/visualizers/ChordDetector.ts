import { describePitch, noteNames } from "../audio/music";
import type { AudioFrame } from "../audio/AudioEngine";
import { clearCanvas, createCanvas, resizeCanvas } from "./canvas";
import { createSliderControl } from "./controls";
import type { Visualizer, VisualizerHost } from "./types";

interface ChordTemplate {
  intervals: number[];
  name: string;
  suffix: string;
}

interface ChordMatch {
  confidence: number;
  label: string;
  root: number;
  template: ChordTemplate;
}

const chordTemplates: ChordTemplate[] = [
  { name: "major", suffix: "", intervals: [0, 4, 7] },
  { name: "minor", suffix: "m", intervals: [0, 3, 7] },
  { name: "diminished", suffix: "dim", intervals: [0, 3, 6] },
  { name: "augmented", suffix: "aug", intervals: [0, 4, 8] },
  { name: "sus2", suffix: "sus2", intervals: [0, 2, 7] },
  { name: "sus4", suffix: "sus4", intervals: [0, 5, 7] },
  { name: "dominant 7", suffix: "7", intervals: [0, 4, 7, 10] },
  { name: "major 7", suffix: "maj7", intervals: [0, 4, 7, 11] },
  { name: "minor 7", suffix: "m7", intervals: [0, 3, 7, 10] },
  { name: "minor major 7", suffix: "mMaj7", intervals: [0, 3, 7, 11] },
  { name: "half diminished", suffix: "m7b5", intervals: [0, 3, 6, 10] },
  { name: "diminished 7", suffix: "dim7", intervals: [0, 3, 6, 9] },
];

export class ChordDetector implements Visualizer {
  id = "chords";
  name = "Chord detector";
  description = "Rolling pitch-class evidence with common triad and seventh chord matching.";

  private canvas = createCanvas();
  private controls = document.createElement("div");
  private context: CanvasRenderingContext2D | null = null;
  private readout: HTMLElement | null = null;
  private pitchEvidence = new Float32Array(12);
  private chromaEvidence = new Float32Array(12);
  private lastPitchSample = 0;
  private pitchHistory: Array<{ pitchClass: number; strength: number; time: number }> = [];
  private confidenceGate = 0.38;
  private historyMs = 3600;

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

    this.updateEvidence(frame, time);
    const combined = this.combinedEvidence();
    const match = this.matchChord(combined);

    this.drawConstellation(context, rect.width, rect.height, combined, match);
    this.updateReadout(match, combined);
  }

  destroy(): void {
    this.canvas.remove();
    this.controls.remove();
    this.context = null;
    this.readout = null;
    this.pitchEvidence.fill(0);
    this.chromaEvidence.fill(0);
    this.pitchHistory = [];
    this.lastPitchSample = 0;
  }

  private updateEvidence(frame: AudioFrame | null, time: number): void {
    for (let i = 0; i < 12; i += 1) {
      this.chromaEvidence[i] *= 0.86;
      this.pitchEvidence[i] *= 0.94;
    }

    if (!frame) {
      return;
    }

    this.updateChroma(frame);

    if (frame.pitch && frame.pitch.confidence > this.confidenceGate && time - this.lastPitchSample > 44) {
      const note = describePitch(frame.pitch.frequency);
      const pitchClass = ((note.midi % 12) + 12) % 12;
      const strength = Math.min(1, 0.25 + frame.pitch.confidence * 0.75);
      this.pitchHistory.push({ pitchClass, strength, time });
      this.lastPitchSample = time;
    }

    this.pitchHistory = this.pitchHistory.filter((sample) => time - sample.time <= this.historyMs);

    for (const sample of this.pitchHistory) {
      const age = (time - sample.time) / this.historyMs;
      this.pitchEvidence[sample.pitchClass] += sample.strength * (1 - age) * 0.045;
    }

    this.normalize(this.pitchEvidence);
    this.normalize(this.chromaEvidence);
  }

  private updateChroma(frame: AudioFrame): void {
    const nyquist = frame.sampleRate / 2;
    const binWidth = nyquist / frame.frequencyBytes.length;

    for (let i = 1; i < frame.frequencyBytes.length; i += 1) {
      const frequency = i * binWidth;

      if (frequency < 55 || frequency > 5000) {
        continue;
      }

      const midi = Math.round(12 * Math.log2(frequency / 440) + 69);
      const pitchClass = ((midi % 12) + 12) % 12;
      const amplitude = frame.frequencyBytes[i] / 255;
      const weight = amplitude * amplitude * (frequency < 1200 ? 1 : 0.58);
      this.chromaEvidence[pitchClass] += weight * 0.022;
    }
  }

  private combinedEvidence(): Float32Array {
    const combined = new Float32Array(12);

    for (let i = 0; i < 12; i += 1) {
      combined[i] = this.pitchEvidence[i] * 0.62 + this.chromaEvidence[i] * 0.38;
    }

    this.normalize(combined);
    return combined;
  }

  private matchChord(evidence: Float32Array): ChordMatch | null {
    const total = evidence.reduce((sum, value) => sum + value, 0);

    if (total < 0.2) {
      return null;
    }

    let best: ChordMatch | null = null;

    for (let root = 0; root < 12; root += 1) {
      for (const template of chordTemplates) {
        const tones = new Set(template.intervals.map((interval) => (root + interval) % 12));
        let toneEnergy = 0;
        let outsideEnergy = 0;

        for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
          if (tones.has(pitchClass)) {
            toneEnergy += evidence[pitchClass];
          } else {
            outsideEnergy += evidence[pitchClass];
          }
        }

        const coverage =
          template.intervals.reduce((sum, interval) => sum + Math.min(1, evidence[(root + interval) % 12] * 2.4), 0) /
          template.intervals.length;
        const confidence = toneEnergy * 0.68 + coverage * 0.42 - outsideEnergy * 0.18;

        if (!best || confidence > best.confidence) {
          best = {
            confidence,
            label: `${noteNames[root]}${template.suffix}`,
            root,
            template,
          };
        }
      }
    }

    return best && best.confidence > 0.38 ? best : null;
  }

  private drawConstellation(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    evidence: Float32Array,
    match: ChordMatch | null,
  ): void {
    const cx = width / 2;
    const cy = height / 2 + 18;
    const radius = Math.min(width, height) * 0.34;
    const activeTones = new Set(match?.template.intervals.map((interval) => (match.root + interval) % 12) ?? []);

    context.save();
    context.strokeStyle = "rgba(168, 184, 207, 0.12)";
    context.lineWidth = 1;

    for (let ring = 0.36; ring <= 1.001; ring += 0.32) {
      context.beginPath();
      context.arc(cx, cy, radius * ring, 0, Math.PI * 2);
      context.stroke();
    }

    for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
      const angle = -Math.PI / 2 + (pitchClass / 12) * Math.PI * 2;
      const x1 = cx + Math.cos(angle) * (radius * 0.3);
      const y1 = cy + Math.sin(angle) * (radius * 0.3);
      const x2 = cx + Math.cos(angle) * (radius + 16);
      const y2 = cy + Math.sin(angle) * (radius + 16);
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    }

    if (match) {
      this.drawChordPolygon(context, cx, cy, radius, match);
    }

    for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
      const angle = -Math.PI / 2 + (pitchClass / 12) * Math.PI * 2;
      const strength = evidence[pitchClass];
      const nodeRadius = 11 + strength * 24;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      const isTone = activeTones.has(pitchClass);
      const isRoot = match?.root === pitchClass;

      context.fillStyle = isRoot
        ? "rgba(255, 198, 41, 0.92)"
        : isTone
          ? "rgba(77, 225, 255, 0.84)"
          : `rgba(97, 112, 138, ${0.22 + strength * 0.42})`;
      context.beginPath();
      context.arc(x, y, nodeRadius, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = isRoot ? "#07080d" : "#f3f7ff";
      context.font = "800 12px 'IBM Plex Mono', ui-monospace, monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(noteNames[pitchClass], x, y);
    }

    this.drawChordReadout(context, width, height, match, evidence);
    context.restore();
  }

  private drawChordPolygon(context: CanvasRenderingContext2D, cx: number, cy: number, radius: number, match: ChordMatch): void {
    const tones = match.template.intervals.map((interval) => (match.root + interval) % 12);

    context.fillStyle = "rgba(77, 225, 255, 0.1)";
    context.strokeStyle = "rgba(255, 198, 41, 0.64)";
    context.lineWidth = 3;
    context.beginPath();

    tones.forEach((pitchClass, index) => {
      const angle = -Math.PI / 2 + (pitchClass / 12) * Math.PI * 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });

    context.closePath();
    context.fill();
    context.stroke();
  }

  private drawChordReadout(context: CanvasRenderingContext2D, width: number, height: number, match: ChordMatch | null, evidence: Float32Array): void {
    context.textAlign = "center";
    context.textBaseline = "middle";

    if (!match) {
      context.fillStyle = "#f3f7ff";
      context.font = "800 46px system-ui, sans-serif";
      context.fillText("Listening", width / 2, 64);
      context.fillStyle = "#a8b8cf";
      context.font = "500 13px 'IBM Plex Mono', ui-monospace, monospace";
      context.fillText(`Play a chord or arpeggiate notes / gate ${Math.round(this.confidenceGate * 100)}%`, width / 2, height - 36);
      return;
    }

    const heardNotes = Array.from(evidence)
      .map((strength, pitchClass) => ({ pitchClass, strength }))
      .filter((note) => note.strength > 0.16)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 6)
      .map((note) => noteNames[note.pitchClass])
      .join(" ");

    context.fillStyle = "#f3f7ff";
    context.font = "900 56px system-ui, sans-serif";
    context.fillText(match.label, width / 2, 58);
    context.fillStyle = "#a8b8cf";
    context.font = "500 13px 'IBM Plex Mono', ui-monospace, monospace";
    context.fillText(
      `${match.template.name} / ${Math.round(match.confidence * 100)}% / heard ${heardNotes || "none"} / memory ${(this.historyMs / 1000).toFixed(1)}s`,
      width / 2,
      height - 36,
    );
  }

  private updateReadout(match: ChordMatch | null, evidence: Float32Array): void {
    if (!this.readout) {
      return;
    }

    if (!match) {
      this.readout.textContent = `No chord match / gate ${Math.round(this.confidenceGate * 100)}% / memory ${(this.historyMs / 1000).toFixed(1)}s`;
      return;
    }

    const heard = Array.from(evidence)
      .map((strength, pitchClass) => ({ pitchClass, strength }))
      .filter((note) => note.strength > 0.16)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5)
      .map((note) => noteNames[note.pitchClass])
      .join(" ");

    this.readout.textContent = `${match.label} / ${match.template.name} / ${Math.round(match.confidence * 100)}% / ${heard} / memory ${(this.historyMs / 1000).toFixed(1)}s`;
  }

  private mountControls(): void {
    this.controls.replaceChildren(
      createSliderControl("Gate", 5, 98, 1, this.confidenceGate * 100, "%", (value) => {
        this.confidenceGate = value / 100;
      }),
      createSliderControl("Memory", 700, 8000, 100, this.historyMs, "ms", (value) => {
        this.historyMs = value;
        this.pitchHistory = [];
      }),
    );
  }

  private normalize(values: Float32Array): void {
    const max = Math.max(...values);

    if (max <= 0.001) {
      return;
    }

    for (let i = 0; i < values.length; i += 1) {
      values[i] = Math.min(1, values[i] / max);
    }
  }
}
