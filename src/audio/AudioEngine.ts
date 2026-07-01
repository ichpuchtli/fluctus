import { autoCorrelate, type PitchEstimate } from "./pitch";

export type AudioSourceMode = "idle" | "microphone" | "demo";
export type AudioStatus = "idle" | "starting" | "running" | "error";

export interface AudioFrame {
  mode: AudioSourceMode;
  status: AudioStatus;
  sampleRate: number;
  timeDomain: Float32Array<ArrayBuffer>;
  frequencyBytes: Uint8Array<ArrayBuffer>;
  frequencyDb: Float32Array<ArrayBuffer>;
  rms: number;
  peak: number;
  pitch: PitchEstimate | null;
}

export interface AudioEngineState {
  mode: AudioSourceMode;
  status: AudioStatus;
  message: string;
}

export class AudioEngine extends EventTarget {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaSource: MediaStreamAudioSourceNode | null = null;
  private oscillator: OscillatorNode | null = null;
  private demoGain: GainNode | null = null;
  private silentSink: GainNode | null = null;
  private demoStartedAt = 0;
  private frame: AudioFrame | null = null;
  private state: AudioEngineState = {
    mode: "idle",
    status: "idle",
    message: "Choose a source",
  };

  getState(): AudioEngineState {
    return { ...this.state };
  }

  getFrame(): AudioFrame | null {
    if (!this.analyser || !this.frame) {
      return null;
    }

    this.analyser.getFloatTimeDomainData(this.frame.timeDomain);
    this.analyser.getByteFrequencyData(this.frame.frequencyBytes);
    this.analyser.getFloatFrequencyData(this.frame.frequencyDb);
    this.updateDemoSource();

    let rms = 0;
    let peak = 0;

    for (const value of this.frame.timeDomain) {
      const abs = Math.abs(value);
      rms += value * value;
      if (abs > peak) {
        peak = abs;
      }
    }

    this.frame.rms = Math.sqrt(rms / this.frame.timeDomain.length);
    this.frame.peak = peak;
    this.frame.pitch = autoCorrelate(this.frame.timeDomain, this.frame.sampleRate);

    return this.frame;
  }

  async startMicrophone(): Promise<void> {
    this.setState({ mode: "microphone", status: "starting", message: "Requesting microphone" });

    try {
      await this.stopCurrentSource();
      const context = this.createContext();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      await context.resume();
      const analyser = this.createAnalyser(context);
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);

      this.mediaStream = stream;
      this.mediaSource = source;
      this.analyser = analyser;
      this.createFrame(context, analyser, "microphone");
      this.setState({ mode: "microphone", status: "running", message: "Microphone live" });
    } catch (error) {
      await this.stopCurrentSource();
      const message = error instanceof Error ? error.message : "Microphone unavailable";
      this.setState({ mode: "idle", status: "error", message });
    }
  }

  async startDemo(): Promise<void> {
    this.setState({ mode: "demo", status: "starting", message: "Starting demo source" });
    await this.stopCurrentSource();
    const context = this.createContext();
    await context.resume();

    const analyser = this.createAnalyser(context);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const silentSink = context.createGain();

    oscillator.type = "sawtooth";
    oscillator.frequency.value = 110;
    gain.gain.value = 0.08;
    silentSink.gain.value = 0;

    oscillator.connect(gain);
    gain.connect(analyser);
    analyser.connect(silentSink);
    silentSink.connect(context.destination);
    oscillator.start();

    this.oscillator = oscillator;
    this.demoGain = gain;
    this.silentSink = silentSink;
    this.demoStartedAt = context.currentTime;
    this.analyser = analyser;
    this.createFrame(context, analyser, "demo");
    this.setState({ mode: "demo", status: "running", message: "Demo source live" });
  }

  async stop(): Promise<void> {
    await this.stopCurrentSource();
    this.setState({ mode: "idle", status: "idle", message: "Choose a source" });
  }

  private createContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioContext();
    }

    return this.audioContext;
  }

  private createAnalyser(context: AudioContext): AnalyserNode {
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.minDecibels = -95;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.82;
    return analyser;
  }

  private createFrame(context: AudioContext, analyser: AnalyserNode, mode: AudioSourceMode): void {
    this.frame = {
      mode,
      status: "running",
      sampleRate: context.sampleRate,
      timeDomain: new Float32Array(analyser.fftSize),
      frequencyBytes: new Uint8Array(analyser.frequencyBinCount),
      frequencyDb: new Float32Array(analyser.frequencyBinCount),
      rms: 0,
      peak: 0,
      pitch: null,
    };
  }

  private async stopCurrentSource(): Promise<void> {
    this.mediaSource?.disconnect();
    this.mediaSource = null;

    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;

    if (this.oscillator) {
      this.oscillator.stop();
      this.oscillator.disconnect();
      this.oscillator = null;
    }

    this.demoGain?.disconnect();
    this.demoGain = null;
    this.silentSink?.disconnect();
    this.silentSink = null;
    this.analyser = null;
    this.frame = null;
  }

  private updateDemoSource(): void {
    if (!this.audioContext || !this.oscillator || !this.demoGain) {
      return;
    }

    const elapsed = this.audioContext.currentTime - this.demoStartedAt;
    const base = 110 + Math.sin(elapsed * 0.31) * 42;
    const shimmer = Math.sin(elapsed * 1.7) * 8;
    const pulse = 0.055 + (Math.sin(elapsed * 2.2) + 1) * 0.025;

    this.oscillator.frequency.setTargetAtTime(base + shimmer, this.audioContext.currentTime, 0.02);
    this.demoGain.gain.setTargetAtTime(pulse, this.audioContext.currentTime, 0.03);
  }

  private setState(next: AudioEngineState): void {
    this.state = next;
    this.dispatchEvent(new CustomEvent<AudioEngineState>("statechange", { detail: this.getState() }));
  }
}
