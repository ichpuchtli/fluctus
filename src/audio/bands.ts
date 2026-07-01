import type { AudioFrame } from "./AudioEngine";

export interface AudioBands {
  bass: number;
  mid: number;
  treble: number;
}

export function getAudioBands(frame: AudioFrame | null): AudioBands {
  if (!frame) {
    return { bass: 0, mid: 0, treble: 0 };
  }

  return {
    bass: bandEnergy(frame, 30, 180),
    mid: bandEnergy(frame, 180, 2200),
    treble: bandEnergy(frame, 2200, 12000),
  };
}

function bandEnergy(frame: AudioFrame, lowFrequency: number, highFrequency: number): number {
  const nyquist = frame.sampleRate / 2;
  const lowBin = Math.max(0, Math.floor((lowFrequency / nyquist) * frame.frequencyBytes.length));
  const highBin = Math.min(
    frame.frequencyBytes.length,
    Math.max(lowBin + 1, Math.ceil((highFrequency / nyquist) * frame.frequencyBytes.length)),
  );

  let sum = 0;

  for (let bin = lowBin; bin < highBin; bin += 1) {
    sum += frame.frequencyBytes[bin] / 255;
  }

  return sum / (highBin - lowBin);
}
