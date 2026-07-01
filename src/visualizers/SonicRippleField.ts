import type { AudioFrame } from "../audio/AudioEngine";
import { VisualAudioSmoother, type MotionFeel } from "../audio/VisualAudioSmoother";
import { createWebGlProgram, resizeWebGlCanvas, type ShaderProgram } from "./webgl";
import type { Visualizer, VisualizerHost } from "./types";

type RipplePreset = "tank" | "ink" | "kaleido";

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
uniform int u_preset;
uniform sampler2D u_audioTexture;

out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

mat2 rotate2d(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float ripple(vec2 p, vec2 center, float speed, float scale, float width) {
  float d = length(p - center);
  float wave = sin(d * scale - u_time * speed);
  float envelope = exp(-d * width);
  return wave * envelope;
}

float audioBin(float index) {
  return texture(u_audioTexture, vec2(clamp(index, 0.0, 1.0), 0.5)).r;
}

vec3 palette(float value, float presetMix) {
  vec3 deep = vec3(0.015, 0.020, 0.040);
  vec3 cyan = vec3(0.110, 0.800, 1.000);
  vec3 amber = vec3(1.000, 0.690, 0.120);
  vec3 magenta = vec3(0.840, 0.250, 1.000);
  vec3 green = vec3(0.300, 1.000, 0.650);
  vec3 color = mix(deep, cyan, smoothstep(0.0, 1.0, value));
  color = mix(color, amber, smoothstep(0.45, 1.2, value + u_bass * 0.9));
  color = mix(color, magenta, smoothstep(0.7, 1.45, value + u_treble * 1.4) * 0.75);
  color = mix(color, green, presetMix * smoothstep(0.2, 1.0, value + u_mid));
  return color;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float pitchNorm = clamp(log2(max(u_pitch, 35.0) / 55.0) / 5.0, 0.0, 1.0);
  float audio = clamp(u_rms * 10.0 + u_peak * 0.35, 0.0, 1.5);
  float lowTexture = audioBin(0.035 + abs(p.x) * 0.07);
  float midTexture = audioBin(0.18 + abs(p.y) * 0.22);
  float highTexture = audioBin(fract(length(p) * 0.28 + pitchNorm * 0.5));
  vec2 pointerP = (u_pointer * u_resolution.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float rotation = (pitchNorm - 0.5) * u_pitchConfidence * 1.8 + u_time * 0.025;
  vec2 q = rotate2d(rotation) * p;

  if (u_preset == 2) {
    float angle = atan(q.y, q.x);
    float radius = length(q);
    float symmetry = 6.0 + floor(pitchNorm * 5.0);
    angle = abs(mod(angle, 6.2831853 / symmetry) - 3.14159265 / symmetry);
    q = vec2(cos(angle), sin(angle)) * radius;
  }

  float wide = ripple(q, vec2(0.0), 2.2 + u_bass * 4.0, 12.0 + u_bass * 18.0, 1.5);
  float left = ripple(q, vec2(-0.48, 0.18), 3.2 + u_mid * 5.0, 20.0 + u_mid * 25.0, 2.3);
  float right = ripple(q, vec2(0.46, -0.22), 4.4 + u_treble * 8.0, 34.0 + u_treble * 45.0, 3.1);
  float pointerWave = ripple(q, rotate2d(rotation) * pointerP, 7.5 + audio * 4.0, 46.0 + highTexture * 85.0, 2.2);
  float drift = noise(q * (2.4 + u_mid * 4.0) + vec2(u_time * 0.05, -u_time * 0.035));
  float spectralRake = sin((q.x * 0.7 + q.y) * (32.0 + midTexture * 92.0) + u_time * (1.6 + highTexture * 9.0));
  float fine = spectralRake * (0.03 + highTexture * 0.08 + u_treble * 0.04);
  float field = wide * (0.42 + u_bass + lowTexture * 0.22)
    + left * (0.22 + u_mid + midTexture * 0.20)
    + right * (0.12 + u_treble + highTexture * 0.18)
    + pointerWave * u_pointerEnergy * (0.38 + audio)
    + fine
    + drift * 0.18;

  if (u_preset == 1) {
    field += noise(q * (6.0 + midTexture * 5.0) + vec2(sin(u_time * 0.13), cos(u_time * 0.11)) * 2.0) * (0.45 + audio);
  }

  float normal = field * 0.5 + 0.5;
  float slope = clamp(length(vec2(dFdx(field), dFdy(field))) * 20.0, 0.0, 1.0);
  float caustic = max(
    0.0,
    sin((q.x * 1.7 + field * 0.9) * (16.0 + lowTexture * 18.0) + u_time * (0.8 + u_bass * 2.0))
      * sin((q.y - field * 0.7) * (19.0 + midTexture * 28.0) - u_time * (0.7 + u_mid * 2.4))
  );
  caustic = pow(caustic, 2.4);
  float vignette = smoothstep(1.35, 0.20, length(p));
  float grid = 0.0;

  if (u_preset == 0) {
    vec2 cell = abs(fract((uv + field * 0.006) * vec2(32.0, 18.0)) - 0.5);
    grid = smoothstep(0.493, 0.5, max(cell.x, cell.y)) * 0.18;
  }

  vec3 color = palette(normal + audio * 0.16, float(u_preset == 1));
  vec3 surface = vec3(0.010, 0.014, 0.030) + color * (0.25 + normal * 0.78);
  surface *= 0.72 + slope * 0.34;
  surface += vec3(0.9, 0.95, 1.0) * pow(max(0.0, field), 5.0) * (0.55 + u_treble * 1.8);
  surface += vec3(1.0, 0.76, 0.25) * u_bass * smoothstep(0.62, 1.0, normal) * 0.28;
  surface += vec3(0.40, 0.86, 1.0) * highTexture * u_pointerEnergy * smoothstep(0.24, 0.0, length(q - rotate2d(rotation) * pointerP)) * 0.55;
  surface += vec3(0.95, 0.45, 1.0) * highTexture * 0.08;
  surface += vec3(0.55, 0.88, 1.0) * caustic * (0.035 + highTexture * 0.09 + u_treble * 0.08);
  surface += vec3(1.0, 0.80, 0.35) * caustic * lowTexture * 0.045;
  surface += grid;
  surface *= 0.42 + vignette * 0.92;
  surface += vec3(0.02, 0.03, 0.05) * smoothstep(0.92, 0.0, uv.y);

  outColor = vec4(pow(surface, vec3(0.88)), 1.0);
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
  "u_preset",
  "u_audioTexture",
];

export class SonicRippleField implements Visualizer {
  id = "sonic-ripple";
  name = "Sonic ripple field";
  description = "A WebGL liquid surface where sound lands as ripples, shimmer, and pressure.";

  private canvas = document.createElement("canvas");
  private controls = document.createElement("div");
  private fallback = document.createElement("div");
  private program: ShaderProgram | null = null;
  private audioTexture: WebGLTexture | null = null;
  private audioTextureData = new Uint8Array(512);
  private readout: HTMLElement | null = null;
  private preset: RipplePreset = "tank";
  private motionFeel: MotionFeel = "flow";
  private pointerX = 0.5;
  private pointerY = 0.5;
  private pointerEnergy = 0;
  private isPointerDown = false;
  private lastRenderTime = 0;
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
    this.pointerEnergy *= Math.exp(-deltaSeconds * 3.6);
    if (this.isPointerDown) {
      this.pointerEnergy = Math.min(1, this.pointerEnergy + deltaSeconds * 0.9);
    }
    this.updateAudioTexture(frame);

    resizeWebGlCanvas(this.canvas, gl);
    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.audioTexture);

    uniform2f(gl, uniforms, "u_resolution", gl.canvas.width, gl.canvas.height);
    uniform1f(gl, uniforms, "u_time", visualAudio.visualTime);
    uniform1f(gl, uniforms, "u_rms", visualAudio.rmsSlow);
    uniform1f(gl, uniforms, "u_peak", visualAudio.transient);
    uniform1f(gl, uniforms, "u_bass", visualAudio.bassSlow);
    uniform1f(gl, uniforms, "u_mid", visualAudio.midSlow);
    uniform1f(gl, uniforms, "u_treble", visualAudio.trebleSmooth);
    uniform1f(gl, uniforms, "u_pitch", visualAudio.pitchFrequency);
    uniform1f(gl, uniforms, "u_pitchConfidence", visualAudio.pitchConfidence);
    uniform2f(gl, uniforms, "u_pointer", this.pointerX, this.pointerY);
    uniform1f(gl, uniforms, "u_pointerEnergy", this.pointerEnergy);
    uniform1i(gl, uniforms, "u_preset", presetIndex(this.preset));
    uniform1i(gl, uniforms, "u_audioTexture", 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.setReadout(
      `${this.preset} / ${this.motionFeel} / slow bass ${visualAudio.bassSlow.toFixed(2)} / body ${visualAudio.drive.toFixed(2)} / transient ${visualAudio.transient.toFixed(3)} / touch ${this.pointerEnergy.toFixed(2)}`,
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
        "preset",
        ["tank", "ink", "kaleido"] as const,
        this.preset,
        (preset) => {
          this.preset = preset;
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
    this.updatePointer(event, 0.42);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    this.updatePointer(event, this.isPointerDown ? 0.16 : 0.055);
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
    this.pointerEnergy = Math.min(1, this.pointerEnergy + impulse + distance * 2.4);
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
        this.audioTextureData[index] = source[sourceIndex];
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
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R8,
    data.length,
    1,
    0,
    gl.RED,
    gl.UNSIGNED_BYTE,
    data,
  );

  return texture;
}

function presetIndex(preset: RipplePreset): number {
  if (preset === "ink") {
    return 1;
  }

  if (preset === "kaleido") {
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

  if (!location) {
    return;
  }

  gl.uniform1f(location, value);
}

function uniform1i(
  gl: WebGL2RenderingContext,
  uniforms: Map<string, WebGLUniformLocation>,
  name: string,
  value: number,
): void {
  const location = uniforms.get(name);

  if (!location) {
    return;
  }

  gl.uniform1i(location, value);
}

function uniform2f(
  gl: WebGL2RenderingContext,
  uniforms: Map<string, WebGLUniformLocation>,
  name: string,
  x: number,
  y: number,
): void {
  const location = uniforms.get(name);

  if (!location) {
    return;
  }

  gl.uniform2f(location, x, y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
