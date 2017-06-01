

const MIN_SAMPLES = 0;  // will be initialized when AudioContext is created.
const GOOD_ENOUGH_CORRELATION = 0.95; // this is the "bar" for how close a correlation needs to be
export function autoCorrelate(buf: Float32Array, sampleRate: number)
{
    const SIZE = buf.length;
    const MAX_SAMPLES = Math.floor(SIZE / 2);
    var best_offset = -1;
    var best_correlation = 0;
    var rms = 0;
    var foundGoodCorrelation = false;
    const correlations = new Array(MAX_SAMPLES);

    for (var i = 0; i < SIZE; i++)
    {
        var val = buf[i];
        rms += val * val;
    }

    rms = Math.sqrt(rms / SIZE);

    if (rms < 0.01)
    {
        // not enough signal
        return -1;
    }

    let lastCorrelation = 1;

    for (let offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++)
    {
        let correlation = 0;

        for (let i = 0; i < MAX_SAMPLES; i++)
        {
            correlation += Math.abs((buf[i]) - (buf[i + offset]));
        }

        correlation = 1 - (correlation / MAX_SAMPLES);

        correlations[offset] = correlation; // store it, for the tweaking we need to do below.

        if ((correlation > GOOD_ENOUGH_CORRELATION) && (correlation > lastCorrelation))
        {
            foundGoodCorrelation = true;

            if (correlation > best_correlation)
            {
                best_correlation = correlation;
                best_offset = offset;
            }
        }
        else if (foundGoodCorrelation)
        {
            // short-circuit - we found a good correlation, then a bad one, so we'd just be seeing copies from here.
            // Now we need to tweak the offset - by interpolating between the values to the left and right of the
            // best offset, and shifting it a bit.  This is complex, and HACKY in this code (happy to take PRs!) -
            // we need to do a curve fit on correlations[] around best_offset in order to better determine precise
            // (anti-aliased) offset.

            // we know best_offset >=1, 
            // since foundGoodCorrelation cannot go to true until the second pass (offset=1), and 
            // we can't drop into this clause until the following pass (else if).
            let shift = (correlations[best_offset + 1] - correlations[best_offset - 1]) / correlations[best_offset];

            return sampleRate / (best_offset + (8 * shift));
        }
        lastCorrelation = correlation;
    }
    if (best_correlation > 0.01)
    {
        return sampleRate / best_offset;
    }
    return -1;
}

export const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function noteFromPitch(frequency: number)
{
    var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));

    return Math.round(noteNum) + 69;
}

export function frequencyFromNoteNumber(note: number)
{
    return 440 /* A4 */ * 2 ** ((note - 68) / 12)
}

export function centsOffFromPitch(frequency: number, note: number)
{
    // We need to find how far freq is from baseFreq in cents
    // We use Math.floor to get the integer part and ignore decimals
    return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2));
}