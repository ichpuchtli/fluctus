export const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export interface DetectedNote {
  midi: number;
  name: string;
  octave: number;
  frequency: number;
  cents: number;
}

export function noteFromPitch(frequency: number): number {
  return Math.round(12 * (Math.log(frequency / 440) / Math.log(2))) + 69;
}

export function frequencyFromNoteNumber(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

export function centsOffFromPitch(frequency: number, note: number): number {
  return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2));
}

export function describePitch(frequency: number): DetectedNote {
  const midi = noteFromPitch(frequency);
  return {
    midi,
    name: noteNames[midi % 12],
    octave: Math.floor(midi / 12) - 1,
    frequency,
    cents: centsOffFromPitch(frequency, midi),
  };
}
