const minSamples = 0;
const goodEnoughCorrelation = 0.95;

export interface PitchEstimate {
  frequency: number;
  confidence: number;
}

export function autoCorrelate(buffer: Float32Array, sampleRate: number): PitchEstimate | null {
  const size = buffer.length;
  const maxSamples = Math.floor(size / 2);
  let bestOffset = -1;
  let bestCorrelation = 0;
  let rms = 0;
  let foundGoodCorrelation = false;
  const correlations = new Array<number>(maxSamples);

  for (let i = 0; i < size; i += 1) {
    const value = buffer[i];
    rms += value * value;
  }

  rms = Math.sqrt(rms / size);

  if (rms < 0.01) {
    return null;
  }

  let lastCorrelation = 1;

  for (let offset = minSamples; offset < maxSamples; offset += 1) {
    let correlation = 0;

    for (let i = 0; i < maxSamples; i += 1) {
      correlation += Math.abs(buffer[i] - buffer[i + offset]);
    }

    correlation = 1 - correlation / maxSamples;
    correlations[offset] = correlation;

    if (correlation > goodEnoughCorrelation && correlation > lastCorrelation) {
      foundGoodCorrelation = true;

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    } else if (foundGoodCorrelation && bestOffset > 0) {
      const left = correlations[bestOffset - 1] ?? bestCorrelation;
      const right = correlations[bestOffset + 1] ?? bestCorrelation;
      const shift = (right - left) / bestCorrelation;

      return {
        frequency: sampleRate / (bestOffset + 8 * shift),
        confidence: Math.max(0, Math.min(1, bestCorrelation)),
      };
    }

    lastCorrelation = correlation;
  }

  if (bestCorrelation > 0.01 && bestOffset > 0) {
    return {
      frequency: sampleRate / bestOffset,
      confidence: Math.max(0, Math.min(1, bestCorrelation)),
    };
  }

  return null;
}
