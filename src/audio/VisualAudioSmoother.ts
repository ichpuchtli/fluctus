import { getAudioBands } from "./bands";
import type { AudioFrame } from "./AudioEngine";

export type MotionFeel = "still" | "flow" | "live";

export interface VisualAudioFeatures {
  bassSlow: number;
  midSlow: number;
  trebleSmooth: number;
  rmsFast: number;
  rmsSlow: number;
  transient: number;
  pitchFrequency: number;
  pitchConfidence: number;
  visualTime: number;
  drive: number;
}

interface MotionSettings {
  bassAttack: number;
  bassRelease: number;
  midAttack: number;
  midRelease: number;
  trebleAttack: number;
  trebleRelease: number;
  rmsSlowAttack: number;
  rmsSlowRelease: number;
  transientRelease: number;
  pitchSeconds: number;
  timeBase: number;
  bassSpeed: number;
  midSpeed: number;
  transientSpeed: number;
}

const motionSettings: Record<MotionFeel, MotionSettings> = {
  still: {
    bassAttack: 0.34,
    bassRelease: 2.9,
    midAttack: 0.25,
    midRelease: 1.75,
    trebleAttack: 0.11,
    trebleRelease: 0.72,
    rmsSlowAttack: 0.42,
    rmsSlowRelease: 2.8,
    transientRelease: 0.7,
    pitchSeconds: 0.42,
    timeBase: 0.07,
    bassSpeed: 0.42,
    midSpeed: 0.08,
    transientSpeed: 0.1,
  },
  flow: {
    bassAttack: 0.18,
    bassRelease: 1.5,
    midAttack: 0.12,
    midRelease: 0.85,
    trebleAttack: 0.055,
    trebleRelease: 0.34,
    rmsSlowAttack: 0.24,
    rmsSlowRelease: 1.55,
    transientRelease: 0.42,
    pitchSeconds: 0.22,
    timeBase: 0.16,
    bassSpeed: 0.82,
    midSpeed: 0.18,
    transientSpeed: 0.24,
  },
  live: {
    bassAttack: 0.07,
    bassRelease: 0.62,
    midAttack: 0.045,
    midRelease: 0.38,
    trebleAttack: 0.025,
    trebleRelease: 0.18,
    rmsSlowAttack: 0.09,
    rmsSlowRelease: 0.55,
    transientRelease: 0.24,
    pitchSeconds: 0.1,
    timeBase: 0.34,
    bassSpeed: 1.25,
    midSpeed: 0.42,
    transientSpeed: 0.5,
  },
};

export class VisualAudioSmoother {
  private bassSlow = 0;
  private midSlow = 0;
  private trebleSmooth = 0;
  private rmsFast = 0;
  private rmsSlow = 0;
  private transient = 0;
  private pitchLog = Math.log2(110);
  private pitchConfidence = 0;
  private visualTime = 0;
  private lastTime = 0;

  update(frame: AudioFrame | null, time: number, feel: MotionFeel = "flow"): VisualAudioFeatures {
    const deltaSeconds = this.consumeDeltaSeconds(time);
    const settings = motionSettings[feel];
    const bands = getAudioBands(frame);
    const rms = frame?.rms ?? 0;

    this.bassSlow = smoothEnvelope(this.bassSlow, bands.bass, deltaSeconds, settings.bassAttack, settings.bassRelease);
    this.midSlow = smoothEnvelope(this.midSlow, bands.mid, deltaSeconds, settings.midAttack, settings.midRelease);
    this.trebleSmooth = smoothEnvelope(
      this.trebleSmooth,
      bands.treble,
      deltaSeconds,
      settings.trebleAttack,
      settings.trebleRelease,
    );
    this.rmsFast = smoothEnvelope(this.rmsFast, rms, deltaSeconds, 0.025, 0.13);
    this.rmsSlow = smoothEnvelope(this.rmsSlow, rms, deltaSeconds, settings.rmsSlowAttack, settings.rmsSlowRelease);
    this.transient = smoothEnvelope(
      this.transient,
      Math.max(0, this.rmsFast - this.rmsSlow * 1.18),
      deltaSeconds,
      0.018,
      settings.transientRelease,
    );
    this.updatePitch(frame, deltaSeconds, settings);

    const drive = clamp(this.bassSlow * 0.72 + this.midSlow * 0.18 + this.rmsSlow * 2.2 + this.transient * 1.4, 0, 1.35);
    const speed =
      settings.timeBase
      + this.bassSlow * settings.bassSpeed
      + this.midSlow * settings.midSpeed
      + this.transient * settings.transientSpeed;
    this.visualTime += deltaSeconds * speed;

    return {
      bassSlow: this.bassSlow,
      midSlow: this.midSlow,
      trebleSmooth: this.trebleSmooth,
      rmsFast: this.rmsFast,
      rmsSlow: this.rmsSlow,
      transient: this.transient,
      pitchFrequency: 2 ** this.pitchLog,
      pitchConfidence: this.pitchConfidence,
      visualTime: this.visualTime,
      drive,
    };
  }

  reset(): void {
    this.bassSlow = 0;
    this.midSlow = 0;
    this.trebleSmooth = 0;
    this.rmsFast = 0;
    this.rmsSlow = 0;
    this.transient = 0;
    this.pitchLog = Math.log2(110);
    this.pitchConfidence = 0;
    this.visualTime = 0;
    this.lastTime = 0;
  }

  private consumeDeltaSeconds(time: number): number {
    if (this.lastTime === 0) {
      this.lastTime = time;
      return 1 / 60;
    }

    const deltaSeconds = clamp((time - this.lastTime) / 1000, 1 / 240, 0.08);
    this.lastTime = time;
    return deltaSeconds;
  }

  private updatePitch(frame: AudioFrame | null, deltaSeconds: number, settings: MotionSettings): void {
    const pitch = frame?.pitch;
    if (!pitch || pitch.confidence < 0.34) {
      this.pitchConfidence = smoothEnvelope(this.pitchConfidence, 0, deltaSeconds, 0.08, 0.65);
      return;
    }

    const targetLog = Math.log2(clamp(pitch.frequency, 35, 5000));
    const pitchAlpha = 1 - Math.exp(-deltaSeconds / settings.pitchSeconds);
    this.pitchLog += (targetLog - this.pitchLog) * pitchAlpha * pitch.confidence;
    this.pitchConfidence = smoothEnvelope(this.pitchConfidence, pitch.confidence, deltaSeconds, 0.12, 0.75);
  }
}

function smoothEnvelope(
  current: number,
  target: number,
  deltaSeconds: number,
  attackSeconds: number,
  releaseSeconds: number,
): number {
  const seconds = target > current ? attackSeconds : releaseSeconds;
  const alpha = 1 - Math.exp(-deltaSeconds / Math.max(0.001, seconds));
  return current + (target - current) * alpha;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
