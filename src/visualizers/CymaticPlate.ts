import type { AudioFrame } from "../audio/AudioEngine";
import { VisualAudioSmoother, type MotionFeel } from "../audio/VisualAudioSmoother";
import { createSliderControl } from "./controls";
import { createWebGlProgram, resizeWebGlCanvas, type ShaderProgram } from "./webgl";
import type { Visualizer, VisualizerHost } from "./types";

type CymaticMode = "plate" | "water" | "sand";

const vertexSource = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_rms;
uniform float u_peak;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_pitch;
uniform float u_pitchConfidence;
uniform vec2 u_pointer;
uniform float u_pointerEnergy;
uniform int u_mode;
uniform sampler2D u_audioTexture;

out vec4 outColor;

float audioBin(float index) {
  return texture(u_audioTexture, vec2(clamp(index, 0.0, 1.0), 0.5)).r;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.17, 289.91))) * 19352.37);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

mat2 rotate2d(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float standingMode(vec2 p, float nx, float ny, float phase) {
  vec2 q = p * 0.5 + 0.5;
  return sin(q.x * 3.14159265 * nx + phase) * sin(q.y * 3.14159265 * ny - phase * 0.73);
}

float radialMode(vec2 p, float rings, float spokes, float phase) {
  float r = length(p);
  float a = atan(p.y, p.x);
  return cos(r * rings - phase) * cos(a * spokes + phase * 0.31);
}

float circleMask(vec2 p) {
  return smoothstep(1.08, 0.98, length(p));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float audio = clamp(u_rms * 13.0 + u_peak * 0.22, 0.0, 1.8);
  float pitchNorm = clamp(log2(max(u_pitch, 38.0) / 55.0) / 5.4, 0.0, 1.0);
  float confidence = clamp(u_pitchConfidence, 0.0, 1.0);
  float spectralLow = audioBin(0.035 + abs(p.x) * 0.075);
  float spectralMid = audioBin(0.12 + length(p) * 0.18);
  float spectralHigh = audioBin(fract(0.34 + pitchNorm * 0.48 + abs(p.y) * 0.11));
  float phase = u_time * (0.52 + u_bass * 1.8 + audio * 0.55);
  vec2 pointerP = (u_pointer * u_resolution.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec2 q = rotate2d((pitchNorm - 0.5) * 0.8 + sin(u_time * 0.07) * 0.08) * p;

  float n1 = 2.0 + floor(pitchNorm * 5.0);
  float n2 = 3.0 + floor(fract(pitchNorm * 2.7 + u_mid) * 6.0);
  float n3 = 4.0 + floor(fract(pitchNorm * 4.1 + u_treble) * 8.0);

  float plate =
    standingMode(q, n1, n2, phase) * (0.55 + u_bass * 0.75)
    + standingMode(rotate2d(0.785) * q, n2 + 1.0, n1 + 2.0, -phase * 1.17) * (0.35 + u_mid * 0.8)
    + radialMode(q, 9.0 + n3 * 2.4 + spectralMid * 12.0, n1 + 2.0, phase * 1.3) * (0.22 + u_treble * 0.62);

  float pointerWave = sin(length(q - pointerP) * (42.0 + spectralHigh * 90.0) - u_time * 8.0);
  pointerWave *= exp(-length(q - pointerP) * 4.2) * u_pointerEnergy;
  plate += pointerWave * (0.4 + audio);

  float displacement = abs(plate);
  float node = 1.0 - smoothstep(0.018, 0.155 + audio * 0.04, displacement);
  float antinode = smoothstep(0.38, 1.22, displacement);
  float slope = clamp(length(vec2(dFdx(plate), dFdy(plate))) * 2.2, 0.0, 1.0);
  float plateMask = circleMask(p);
  float rim = smoothstep(1.02, 0.99, length(p)) - smoothstep(0.99, 0.94, length(p));
  float grains = noise(q * (180.0 + spectralHigh * 80.0) + u_time * 0.18);
  float powder = node * smoothstep(0.32, 0.95, grains + node * 0.45 + u_treble * 0.2);

  vec3 base = vec3(0.006, 0.010, 0.019);
  vec3 steel = vec3(0.30, 0.43, 0.54);
  vec3 ice = vec3(0.42, 0.86, 1.0);
  vec3 violet = vec3(0.72, 0.44, 1.0);
  vec3 sand = vec3(1.0, 0.72, 0.30);
  vec3 water = vec3(0.10, 0.72, 0.95);

  vec3 color = base;

  if (u_mode == 1) {
    float caustic = pow(max(0.0, sin((q.x + plate * 0.16) * (22.0 + spectralLow * 32.0) + phase)
      * sin((q.y - plate * 0.14) * (26.0 + spectralMid * 40.0) - phase * 1.2)), 2.1);
    color += water * (0.16 + antinode * 0.36 + slope * 0.25);
    color += ice * caustic * (0.16 + audio * 0.22);
    color += violet * spectralHigh * 0.16;
  } else if (u_mode == 2) {
    color += steel * (0.14 + slope * 0.18);
    color += sand * powder * (0.78 + confidence * 0.22);
    color += vec3(1.0, 0.88, 0.55) * node * spectralHigh * 0.22;
    color -= vec3(0.08, 0.05, 0.02) * antinode * 0.22;
  } else {
    color += steel * (0.18 + slope * 0.25);
    color += ice * node * (0.42 + confidence * 0.28);
    color += violet * antinode * (0.20 + u_mid * 0.18);
    color += sand * rim * (0.54 + u_bass * 0.42);
  }

  float scan = smoothstep(0.006, 0.0, abs(fract(uv.y * 34.0 + plate * 0.035) - 0.5)) * 0.045;
  float glow = node * (0.14 + audio * 0.18) + antinode * (0.08 + u_mid * 0.12);
  color += vec3(0.48, 0.90, 1.0) * glow;
  color += scan;
  color *= plateMask;
  color += vec3(0.020, 0.024, 0.034) * (1.0 - plateMask);
  color += vec3(1.0, 0.78, 0.32) * rim * 0.45;
  color *= smoothstep(1.24, 0.24, length(p));

  outColor = vec4(pow(max(color, vec3(0.0)), vec3(0.9)), 1.0);
}`;

const uniformNames = [
  "u_resolution",
  "u_time",
  "u_rms",
  "u_peak",
  "u_bass",
  "u_mid",
  "u_treble",
  "u_pitch",
  "u_pitchConfidence",
  "u_pointer",
  "u_pointerEnergy",
  "u_mode",
  "u_audioTexture",
];

export class CymaticPlate implements Visualizer {
  id = "cymatic-plate";
  name = "Cymatic plate";
  description = "A WebGL standing-wave plate where pitch carves nodal lines into powder, water, and metal.";

  private canvas = document.createElement("canvas");
  private controls = document.createElement("div");
  private fallback = document.createElement("div");
  private program: ShaderProgram | null = null;
  private audioTexture: WebGLTexture | null = null;
  private audioTextureData = new Uint8Array(512);
  private readout: HTMLElement | null = null;
  private mode: CymaticMode = "plate";
  private motionFeel: MotionFeel = "flow";
  private pointerX = 0.5;
  private pointerY = 0.5;
  private pointerEnergy = 0;
  private isPointerDown = false;
  private lastRenderTime = 0;
  private excitation = 1;
  private grainGain = 1;
  private touchGain = 1;
  private smoother = new VisualAudioSmoother();

  constructor() {
    this.canvas.className = "visual-canvas webgl-canvas";
    this.controls.className = "preset-controls";
    this.fallback.className = "webgl-fallback";
    this.fallback.textContent = "WebGL2 is unavailable in this browser.";
  }

  mount(host: VisualizerHost): void {
    host.title.textContent = this.name;
    this.readout = host.readout;
    host.surface.append(this.canvas, this.controls);
    this.mountControls();

    try {
      this.program = createWebGlProgram(this.canvas, vertexSource, fragmentSource, uniformNames);
    } catch (error) {
      this.program = null;
      this.fallback.textContent = error instanceof Error ? error.message : "Unable to start WebGL visualizer.";
    }

    if (!this.program) {
      host.surface.append(this.fallback);
      this.setReadout("WebGL2 unavailable");
      return;
    }

    this.audioTexture = createAudioTexture(this.program.gl, this.audioTextureData);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerUp);
    this.canvas.addEventListener("pointerleave", this.handlePointerUp);
    this.resize();
  }

  resize(): void {
    if (this.program) {
      resizeWebGlCanvas(this.canvas, this.program.gl);
    }
  }

  render(frame: AudioFrame | null, time: number): void {
    if (!this.program) {
      return;
    }

    const { gl, program, vertexArray, uniforms } = this.program;
    const visualAudio = this.smoother.update(frame, time, this.motionFeel);
    const deltaSeconds = this.lastRenderTime === 0 ? 0 : Math.max(0, (time - this.lastRenderTime) / 1000);
    this.lastRenderTime = time;
    this.pointerEnergy *= Math.exp(-deltaSeconds * 3.2);
    if (this.isPointerDown) {
      this.pointerEnergy = Math.min(1, this.pointerEnergy + deltaSeconds);
    }
    this.updateAudioTexture(frame);

    resizeWebGlCanvas(this.canvas, gl);
    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.audioTexture);

    uniform2f(gl, uniforms, "u_resolution", gl.canvas.width, gl.canvas.height);
    uniform1f(gl, uniforms, "u_time", visualAudio.visualTime);
    uniform1f(gl, uniforms, "u_rms", clamp(visualAudio.rmsSlow * this.excitation, 0, 1.8));
    uniform1f(gl, uniforms, "u_peak", clamp(visualAudio.transient * this.excitation, 0, 1.8));
    uniform1f(gl, uniforms, "u_bass", clamp(visualAudio.bassSlow * this.excitation, 0, 1.6));
    uniform1f(gl, uniforms, "u_mid", clamp(visualAudio.midSlow * this.excitation, 0, 1.6));
    uniform1f(gl, uniforms, "u_treble", clamp(visualAudio.trebleSmooth * this.excitation, 0, 1.6));
    uniform1f(gl, uniforms, "u_pitch", visualAudio.pitchFrequency);
    uniform1f(gl, uniforms, "u_pitchConfidence", visualAudio.pitchConfidence);
    uniform2f(gl, uniforms, "u_pointer", this.pointerX, this.pointerY);
    uniform1f(gl, uniforms, "u_pointerEnergy", clamp(this.pointerEnergy * this.touchGain, 0, 2));
    uniform1i(gl, uniforms, "u_mode", modeIndex(this.mode));
    uniform1i(gl, uniforms, "u_audioTexture", 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.setReadout(
      `${this.mode} / ${this.motionFeel} / excite ${this.excitation.toFixed(1)}x / grains ${this.grainGain.toFixed(1)}x / ${visualAudio.pitchFrequency.toFixed(1)} Hz / touch ${this.pointerEnergy.toFixed(2)}`,
    );
  }

  destroy(): void {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
    this.canvas.removeEventListener("pointerleave", this.handlePointerUp);

    if (this.program) {
      const { gl, program, vertexArray } = this.program;
      if (this.audioTexture) {
        gl.deleteTexture(this.audioTexture);
      }
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);
    }

    this.canvas.remove();
    this.controls.remove();
    this.fallback.remove();
    this.program = null;
    this.audioTexture = null;
    this.readout = null;
    this.isPointerDown = false;
    this.pointerEnergy = 0;
    this.lastRenderTime = 0;
    this.smoother.reset();
  }

  private mountControls(): void {
    this.controls.replaceChildren();
    this.controls.append(
      createButtonGroup(
        "mode",
        ["plate", "water", "sand"] as const,
        this.mode,
        (mode) => {
          this.mode = mode;
        },
      ),
      createButtonGroup(
        "motion",
        ["still", "flow", "live"] as const,
        this.motionFeel,
        (feel) => {
          this.motionFeel = feel;
          this.smoother.reset();
        },
      ),
      createSliderControl("Excite", 20, 340, 5, this.excitation * 100, "%", (value) => {
        this.excitation = value / 100;
      }),
      createSliderControl("Grains", 20, 340, 5, this.grainGain * 100, "%", (value) => {
        this.grainGain = value / 100;
      }),
      createSliderControl("Touch", 0, 240, 5, this.touchGain * 100, "%", (value) => {
        this.touchGain = value / 100;
      }),
    );
  }

  private setReadout(value: string): void {
    if (this.readout) {
      this.readout.textContent = value;
    }
  }

  private handlePointerDown = (event: PointerEvent): void => {
    this.isPointerDown = true;
    this.canvas.setPointerCapture(event.pointerId);
    this.updatePointer(event, 0.45);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    this.updatePointer(event, this.isPointerDown ? 0.18 : 0.06);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    this.isPointerDown = false;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  };

  private updatePointer(event: PointerEvent, impulse: number): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const nextX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const nextY = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
    const distance = Math.hypot(nextX - this.pointerX, nextY - this.pointerY);

    this.pointerX = nextX;
    this.pointerY = nextY;
    this.pointerEnergy = Math.min(1, this.pointerEnergy + impulse + distance * 2.2);
  }

  private updateAudioTexture(frame: AudioFrame | null): void {
    if (!this.program || !this.audioTexture) {
      return;
    }

    const source = frame?.frequencyBytes;
    if (!source) {
      this.audioTextureData.fill(0);
    } else {
      for (let index = 0; index < this.audioTextureData.length; index += 1) {
        const sourceIndex = Math.min(source.length - 1, Math.floor((index / this.audioTextureData.length) * source.length));
        this.audioTextureData[index] = Math.min(255, Math.round(source[sourceIndex] * this.grainGain));
      }
    }

    const { gl } = this.program;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.audioTexture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      this.audioTextureData.length,
      1,
      gl.RED,
      gl.UNSIGNED_BYTE,
      this.audioTextureData,
    );
  }
}

function createButtonGroup<const T extends string>(
  label: string,
  values: readonly T[],
  selected: T,
  onSelect: (value: T) => void,
): HTMLElement {
  const group = document.createElement("div");
  group.className = "preset-group";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", label);

  const groupLabel = document.createElement("span");
  groupLabel.className = "preset-label";
  groupLabel.textContent = label;
  group.append(groupLabel);

  for (const value of values) {
    const button = document.createElement("button");
    button.className = "preset-button";
    button.type = "button";
    button.textContent = value;
    button.setAttribute("aria-pressed", String(selected === value));
    button.addEventListener("click", () => {
      onSelect(value);
      for (const child of group.querySelectorAll<HTMLButtonElement>("button")) {
        child.setAttribute("aria-pressed", String(child === button));
      }
    });
    group.append(button);
  }

  return group;
}

function createAudioTexture(gl: WebGL2RenderingContext, data: Uint8Array): WebGLTexture {
  const texture = gl.createTexture();

  if (!texture) {
    throw new Error("Unable to create WebGL audio texture");
  }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, data.length, 1, 0, gl.RED, gl.UNSIGNED_BYTE, data);

  return texture;
}

function modeIndex(mode: CymaticMode): number {
  if (mode === "water") {
    return 1;
  }

  if (mode === "sand") {
    return 2;
  }

  return 0;
}

function uniform1f(
  gl: WebGL2RenderingContext,
  uniforms: Map<string, WebGLUniformLocation>,
  name: string,
  value: number,
): void {
  const location = uniforms.get(name);

  if (location) {
    gl.uniform1f(location, value);
  }
}

function uniform1i(
  gl: WebGL2RenderingContext,
  uniforms: Map<string, WebGLUniformLocation>,
  name: string,
  value: number,
): void {
  const location = uniforms.get(name);

  if (location) {
    gl.uniform1i(location, value);
  }
}

function uniform2f(
  gl: WebGL2RenderingContext,
  uniforms: Map<string, WebGLUniformLocation>,
  name: string,
  x: number,
  y: number,
): void {
  const location = uniforms.get(name);

  if (location) {
    gl.uniform2f(location, x, y);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
