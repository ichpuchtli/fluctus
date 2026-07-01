export function createCanvas(className = "visual-canvas"): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = className;
  return canvas;
}

export function resizeCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D canvas is unavailable");
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return context;
}

export function clearCanvas(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, color = "#07080d"): void {
  const { width, height } = canvas.getBoundingClientRect();
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
}
