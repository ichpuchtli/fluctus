/// <reference path="uibuilder-1.4.3.d.ts" />
/// <reference path="cssproperties.d.ts" />
define("Component", ["require", "exports"], function (require, exports) {
    "use strict";
    function mount(parent, component) {
        parent.appendChild(component.el);
    }
    exports.mount = mount;
});
/// <reference path="cssproperties.d.ts" />
define("NoteDisplayComponent", ["require", "exports"], function (require, exports) {
    "use strict";
    class NoteDisplayComponent {
        constructor() {
            this.el = (UIBuilder.createElement("span", { className: 'note' }, "?"));
        }
        update({ note }) {
            if (this.el.textContent !== note) {
                this.el.textContent = note;
            }
        }
    }
    exports.NoteDisplayComponent = NoteDisplayComponent;
});
define("FrequencyDomainComponent", ["require", "exports"], function (require, exports) {
    "use strict";
    class FrequencyDomainComponent {
        constructor() {
            this.polyline = UIBuilder.createElement("polyline", { points: "0,2000", stroke: "cyan", fill: "none", style: { strokeWidth: '3px' }, "vector-effect": "non-scaling-stroke" });
            this.el = (UIBuilder.createElement("svg", { viewBox: '0 0 3000 300', style: { width: '100%', height: '100vh' } }, this.polyline));
            this.startTime = new Date();
        }
        get bbox() {
            return this.el.viewBox.baseVal;
        }
        update(frequency) {
            var x = new Date().getTime() - this.startTime.getTime() + this.bbox.width;
            if (frequency != 0) {
                this.polyline.points.appendItem(this.newSvgPoint(x, this.bbox.height - frequency));
            }
            this.el.viewBox.baseVal.x = x - this.bbox.width;
        }
        newSvgPoint(x, y) {
            var p = this.el.createSVGPoint();
            p.x = x;
            p.y = y;
            return p;
        }
    }
    exports.FrequencyDomainComponent = FrequencyDomainComponent;
});
define("Utils", ["require", "exports"], function (require, exports) {
    "use strict";
    const MIN_SAMPLES = 0; // will be initialized when AudioContext is created.
    const GOOD_ENOUGH_CORRELATION = 0.95; // this is the "bar" for how close a correlation needs to be
    function autoCorrelate(buf, sampleRate) {
        const SIZE = buf.length;
        const MAX_SAMPLES = Math.floor(SIZE / 2);
        var best_offset = -1;
        var best_correlation = 0;
        var rms = 0;
        var foundGoodCorrelation = false;
        const correlations = new Array(MAX_SAMPLES);
        for (var i = 0; i < SIZE; i++) {
            var val = buf[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / SIZE);
        if (rms < 0.01) {
            // not enough signal
            return -1;
        }
        let lastCorrelation = 1;
        for (let offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
            let correlation = 0;
            for (let i = 0; i < MAX_SAMPLES; i++) {
                correlation += Math.abs((buf[i]) - (buf[i + offset]));
            }
            correlation = 1 - (correlation / MAX_SAMPLES);
            correlations[offset] = correlation; // store it, for the tweaking we need to do below.
            if ((correlation > GOOD_ENOUGH_CORRELATION) && (correlation > lastCorrelation)) {
                foundGoodCorrelation = true;
                if (correlation > best_correlation) {
                    best_correlation = correlation;
                    best_offset = offset;
                }
            }
            else if (foundGoodCorrelation) {
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
        if (best_correlation > 0.01) {
            return sampleRate / best_offset;
        }
        return -1;
    }
    exports.autoCorrelate = autoCorrelate;
    exports.noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    function noteFromPitch(frequency) {
        var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
        return Math.round(noteNum) + 69;
    }
    exports.noteFromPitch = noteFromPitch;
    function frequencyFromNoteNumber(note) {
        return 440 /* A4 */ * Math.pow(2, ((note - 68) / 12));
    }
    exports.frequencyFromNoteNumber = frequencyFromNoteNumber;
    function centsOffFromPitch(frequency, note) {
        // We need to find how far freq is from baseFreq in cents
        // We use Math.floor to get the integer part and ignore decimals
        return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2));
    }
    exports.centsOffFromPitch = centsOffFromPitch;
});
/// <reference path="Utils.ts" />
/// <reference path="NoteDisplayComponent.tsx" />
define("fluctus", ["require", "exports", "Component", "NoteDisplayComponent", "FrequencyDomainComponent", "Utils"], function (require, exports, Component_1, NoteDisplayComponent_1, FrequencyDomainComponent_1, Utils) {
    "use strict";
    var noteComponent = new NoteDisplayComponent_1.NoteDisplayComponent();
    var freqComponent = new FrequencyDomainComponent_1.FrequencyDomainComponent();
    const div = document.querySelector('#app');
    Component_1.mount(div, noteComponent);
    Component_1.mount(div, freqComponent);
    if (div === null) {
        throw new Error('span === null');
    }
    if (!navigator.getUserMedia) {
        throw new Error('getUserMedia not supported on your browser!');
    }
    navigator.getUserMedia(
    // constraints - only audio needed for this app
    {
        audio: true
    }, 
    // Success callback
    function (stream) {
        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        const floatArray = new Float32Array(analyser.fftSize);
        const update = () => {
            window.requestAnimationFrame(update);
            analyser.getFloatTimeDomainData(floatArray);
            const fundalmentalFreq = Utils.autoCorrelate(floatArray, audioCtx.sampleRate);
            if (fundalmentalFreq === -1) {
                noteComponent.update({ note: '?' });
                freqComponent.update(0);
                return;
            }
            const note = Utils.noteFromPitch(fundalmentalFreq);
            const noteSymbol = Utils.noteStrings[note % 12];
            const cents = Utils.centsOffFromPitch(fundalmentalFreq, note);
            console.log(`Note: ${note} (${noteSymbol}), Cents: ${Math.abs(cents)}, Freq: ${Math.round(fundalmentalFreq)}Hz`);
            noteComponent.update({ note: noteSymbol });
            freqComponent.update(fundalmentalFreq);
        };
        update();
    }, 
    // Error callback
    function (err) {
        throw new Error('The following gUM error occured: ' + err);
    });
});
//# sourceMappingURL=app.js.map