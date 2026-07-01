import type { AudioFrame } from "../audio/AudioEngine";

export interface VisualizerHost {
  surface: HTMLElement;
  title: HTMLElement;
  readout: HTMLElement;
}

export interface Visualizer {
  id: string;
  name: string;
  description: string;
  mount(host: VisualizerHost): void;
  resize(): void;
  render(frame: AudioFrame | null, time: number): void;
  destroy(): void;
}
