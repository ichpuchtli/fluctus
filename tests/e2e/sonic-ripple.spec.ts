import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { inflateSync } from "node:zlib";

test("Pitch detector exposes adjustable hold and lag controls", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Demo" }).click();

  const canvas = page.locator(".visual-surface .visual-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pitch detector" })).toBeVisible();

  const hold = page.getByRole("slider", { name: "Hold" });
  const lag = page.getByRole("slider", { name: "Lag" });
  const gate = page.getByRole("slider", { name: "Gate" });

  await expect(hold).toBeVisible();
  await expect(lag).toBeVisible();
  await expect(gate).toBeVisible();
  await hold.fill("3000");
  await lag.fill("92");
  await gate.fill("25");

  await expect(page.locator(".adjustment-value", { hasText: "3000ms" })).toBeVisible();
  await expect(page.locator(".adjustment-value", { hasText: "92%" })).toBeVisible();

  await page.waitForTimeout(600);

  const screenshot = await canvas.screenshot();
  const stats = readPngStats(screenshot);

  expect(stats.distinctBuckets).toBeGreaterThan(8);
  expect(stats.nonDarkRatio).toBeGreaterThan(0.01);
  expect(consoleFailures).toEqual([]);
});

test("Solfege trainer renders training controls and scale surface", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Solfege trainer" }).click();
  await page.getByRole("button", { name: "Demo" }).click();

  const canvas = page.locator(".visual-surface .visual-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solfege trainer" })).toBeVisible();
  await expect(page.getByLabel("Root", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Octave", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Mode", { exact: true })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Gate" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Tol" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Hold" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Damp" })).toBeVisible();

  await page.waitForTimeout(700);

  const screenshot = await canvas.screenshot();
  const stats = readPngStats(screenshot);

  expect(stats.distinctBuckets).toBeGreaterThan(8);
  expect(stats.nonDarkRatio).toBeGreaterThan(0.01);
  expect(consoleFailures).toEqual([]);
});

test("Note history renders a nonblank tuning surface", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Note history" }).click();
  await page.getByRole("button", { name: "Demo" }).click();

  const canvas = page.locator(".visual-surface .visual-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("heading", { name: "Note history" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Gate" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Rate" })).toBeVisible();

  await page.waitForTimeout(600);

  const dimensions = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    return {
      clientWidth: canvasElement.clientWidth,
      clientHeight: canvasElement.clientHeight,
      width: canvasElement.width,
      height: canvasElement.height,
    };
  });

  expect(dimensions.clientWidth).toBeGreaterThan(300);
  expect(dimensions.clientHeight).toBeGreaterThan(260);
  expect(dimensions.width).toBeGreaterThan(300);
  expect(dimensions.height).toBeGreaterThan(260);

  const screenshot = await canvas.screenshot();
  const stats = readPngStats(screenshot);

  expect(stats.distinctBuckets).toBeGreaterThan(8);
  expect(stats.nonDarkRatio).toBeGreaterThan(0.01);
  expect(consoleFailures).toEqual([]);
});

test("Interval detector renders a nonblank interval surface", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Interval detector" }).click();
  await page.getByRole("button", { name: "Demo" }).click();

  const canvas = page.locator(".visual-surface .visual-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("heading", { name: "Interval detector" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lock root" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Gate" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Lock" })).toBeVisible();

  await page.waitForTimeout(800);

  const screenshot = await canvas.screenshot();
  const stats = readPngStats(screenshot);

  expect(stats.distinctBuckets).toBeGreaterThan(8);
  expect(stats.nonDarkRatio).toBeGreaterThan(0.01);
  expect(consoleFailures).toEqual([]);
});

test("Chord detector renders a nonblank chord surface", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Chord detector" }).click();
  await page.getByRole("button", { name: "Demo" }).click();

  const canvas = page.locator(".visual-surface .visual-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chord detector" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Gate" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Memory" })).toBeVisible();

  await page.waitForTimeout(900);

  const screenshot = await canvas.screenshot();
  const stats = readPngStats(screenshot);

  expect(stats.distinctBuckets).toBeGreaterThan(8);
  expect(stats.nonDarkRatio).toBeGreaterThan(0.01);
  expect(consoleFailures).toEqual([]);
});

test("Harmonics renders a nonblank overtone surface", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Harmonics" }).click();
  await page.getByRole("button", { name: "Demo" }).click();

  const canvas = page.locator(".visual-surface .visual-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("heading", { name: "Harmonics" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Gate" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Smooth" })).toBeVisible();

  await page.waitForTimeout(800);

  const screenshot = await canvas.screenshot();
  const stats = readPngStats(screenshot);

  expect(stats.distinctBuckets).toBeGreaterThan(8);
  expect(stats.nonDarkRatio).toBeGreaterThan(0.01);
  expect(consoleFailures).toEqual([]);
});

test("Oscilloscope exposes waveform tuning controls", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Oscilloscope" }).click();
  await page.getByRole("button", { name: "Demo" }).click();

  const canvas = page.locator(".visual-surface .visual-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("heading", { name: "Oscilloscope" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Gain" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Window" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Trace" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Persist" })).toBeVisible();

  await page.getByRole("slider", { name: "Gain" }).fill("220");
  await page.waitForTimeout(500);

  const screenshot = await canvas.screenshot();
  const stats = readPngStats(screenshot);

  expect(stats.distinctBuckets).toBeGreaterThan(8);
  expect(stats.nonDarkRatio).toBeGreaterThan(0.01);
  expect(consoleFailures).toEqual([]);
});

test("Spectrum analyzer exposes FFT tuning controls", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Spectrum analyzer" }).click();
  await page.getByRole("button", { name: "Demo" }).click();

  const canvas = page.locator(".visual-surface .visual-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("heading", { name: "Spectrum analyzer" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Bars" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Gain" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Floor" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Curve" })).toBeVisible();

  await page.getByRole("slider", { name: "Bars" }).fill("144");
  await page.waitForTimeout(500);

  const screenshot = await canvas.screenshot();
  const stats = readPngStats(screenshot);

  expect(stats.distinctBuckets).toBeGreaterThan(8);
  expect(stats.nonDarkRatio).toBeGreaterThan(0.01);
  expect(consoleFailures).toEqual([]);
});

test("Spectrogram exposes history tuning controls", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Spectrogram" }).click();
  await page.getByRole("button", { name: "Demo" }).click();

  const canvas = page.locator(".visual-surface .visual-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("heading", { name: "Spectrogram" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Speed" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Gain" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Floor" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Contrast" })).toBeVisible();

  await page.getByRole("slider", { name: "Speed" }).fill("16");
  await page.waitForTimeout(700);

  const screenshot = await canvas.screenshot();
  const stats = readPngStats(screenshot);

  expect(stats.distinctBuckets).toBeGreaterThan(8);
  expect(stats.nonDarkRatio).toBeGreaterThan(0.01);
  expect(consoleFailures).toEqual([]);
});

test("Sonic Ripple Field renders a nonblank WebGL surface", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Sonic ripple field" }).click();
  await page.getByRole("button", { name: "Demo" }).click();

  const canvas = page.locator(".webgl-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sonic ripple field" })).toBeVisible();
  await expect(page.getByRole("button", { name: "still" })).toBeVisible();
  await expect(page.getByRole("button", { name: "flow" })).toBeVisible();
  await expect(page.getByRole("button", { name: "live" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Drive" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Texture" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Touch" })).toBeVisible();
  await expect(page.locator("[data-readout]")).toContainText(/tank \/ flow \/ drive/);

  await page.waitForTimeout(700);

  const dimensions = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    return {
      clientWidth: canvasElement.clientWidth,
      clientHeight: canvasElement.clientHeight,
      width: canvasElement.width,
      height: canvasElement.height,
    };
  });

  expect(dimensions.clientWidth).toBeGreaterThan(300);
  expect(dimensions.clientHeight).toBeGreaterThan(260);
  expect(dimensions.width).toBeGreaterThan(300);
  expect(dimensions.height).toBeGreaterThan(260);

  const screenshot = await canvas.screenshot();
  const stats = readPngStats(screenshot);

  expect(stats.distinctBuckets).toBeGreaterThan(16);
  expect(stats.nonDarkRatio).toBeGreaterThan(0.015);
  expect(consoleFailures).toEqual([]);
});

test("Cymatic Plate renders a nonblank WebGL surface", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Cymatic plate" }).click();
  await page.getByRole("button", { name: "Demo" }).click();

  const canvas = page.locator(".webgl-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cymatic plate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "water" })).toBeVisible();
  await expect(page.getByRole("button", { name: "sand" })).toBeVisible();
  await expect(page.getByRole("button", { name: "still" })).toBeVisible();
  await expect(page.getByRole("button", { name: "flow" })).toBeVisible();
  await expect(page.getByRole("button", { name: "live" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Excite" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Grains" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Touch" })).toBeVisible();
  await expect(page.locator("[data-readout]")).toContainText(/plate \/ flow/);

  await page.waitForTimeout(700);

  const screenshot = await canvas.screenshot();
  const stats = readPngStats(screenshot);

  expect(stats.distinctBuckets).toBeGreaterThan(16);
  expect(stats.nonDarkRatio).toBeGreaterThan(0.015);
  expect(consoleFailures).toEqual([]);
});

function collectConsoleFailures(page: Page): string[] {
  const consoleFailures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleFailures.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleFailures.push(error.message);
  });

  return consoleFailures;
}

interface PngStats {
  distinctBuckets: number;
  nonDarkRatio: number;
}

interface PngImage {
  width: number;
  height: number;
  colorType: number;
  bitDepth: number;
  data: Buffer;
}

function readPngStats(buffer: Buffer): PngStats {
  const image = decodePng(buffer);
  const channels = channelsForColorType(image.colorType);
  const bytesPerPixel = Math.max(1, channels);
  const stride = image.width * channels;
  const rows = unfilterRows(image.data, image.width, image.height, channels, bytesPerPixel);
  const buckets = new Set<string>();
  let nonDark = 0;
  let sampled = 0;
  const step = Math.max(1, Math.floor((image.width * image.height) / 5000));

  for (let pixel = 0; pixel < image.width * image.height; pixel += step) {
    const offset = pixel * channels;
    const r = rows[offset] ?? 0;
    const g = rows[offset + (channels > 1 ? 1 : 0)] ?? r;
    const b = rows[offset + (channels > 2 ? 2 : 0)] ?? r;
    const alpha = channels === 4 ? rows[offset + 3] : 255;

    if (alpha > 8 && r + g + b > 42) {
      nonDark += 1;
    }

    buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}:${alpha >> 6}`);
    sampled += 1;
  }

  return {
    distinctBuckets: buckets.size,
    nonDarkRatio: nonDark / sampled,
  };
}

function decodePng(buffer: Buffer): PngImage {
  const signature = buffer.subarray(0, 8);
  if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("Screenshot is not a PNG");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    }

    if (type === "IDAT") {
      idatChunks.push(data);
    }

    if (type === "IEND") {
      break;
    }

    offset += length + 12;
  }

  if (width === 0 || height === 0 || bitDepth !== 8) {
    throw new Error("Unsupported PNG screenshot format");
  }

  return {
    width,
    height,
    bitDepth,
    colorType,
    data: inflateSync(Buffer.concat(idatChunks)),
  };
}

function channelsForColorType(colorType: number): number {
  if (colorType === 0) {
    return 1;
  }

  if (colorType === 2) {
    return 3;
  }

  if (colorType === 6) {
    return 4;
  }

  throw new Error(`Unsupported PNG color type: ${colorType}`);
}

function unfilterRows(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  bytesPerPixel: number,
): Uint8Array {
  const stride = width * channels;
  const output = new Uint8Array(stride * height);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = data[sourceOffset];
    sourceOffset += 1;
    const rowStart = y * stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = data[sourceOffset + x];
      const left = x >= bytesPerPixel ? output[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? output[rowStart + x - stride] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? output[rowStart + x - stride - bytesPerPixel] : 0;
      output[rowStart + x] = (raw + predict(filter, left, up, upLeft)) & 0xff;
    }

    sourceOffset += stride;
  }

  return output;
}

function predict(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) {
    return 0;
  }

  if (filter === 1) {
    return left;
  }

  if (filter === 2) {
    return up;
  }

  if (filter === 3) {
    return Math.floor((left + up) / 2);
  }

  if (filter === 4) {
    const p = left + up - upLeft;
    const pa = Math.abs(p - left);
    const pb = Math.abs(p - up);
    const pc = Math.abs(p - upLeft);
    return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
  }

  throw new Error(`Unsupported PNG filter: ${filter}`);
}
