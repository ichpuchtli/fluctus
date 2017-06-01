/// <reference path="Utils.ts" />
/// <reference path="NoteDisplayComponent.tsx" />

import { mount } from "./Component";
import { NoteDisplayComponent } from "./NoteDisplayComponent";
import { FrequencyDomainComponent } from "./FrequencyDomainComponent";
import * as Utils from "./Utils";

var noteComponent = new NoteDisplayComponent();
var freqComponent = new FrequencyDomainComponent();

const div = document.querySelector('#app') as HTMLDivElement;

mount(div, noteComponent);
mount(div, freqComponent)

if(div === null)
{
    throw new Error('span === null');
}

if (!navigator.getUserMedia)
{
    throw new Error('getUserMedia not supported on your browser!');
}

navigator.getUserMedia(
    // constraints - only audio needed for this app
    {
        audio: true
    },

    // Success callback
    function (stream)
    {
        const audioCtx = new AudioContext()

        const analyser = audioCtx.createAnalyser();

        analyser.fftSize = 2048;

        const source = audioCtx.createMediaStreamSource(stream);

        source.connect(analyser);

        const floatArray = new Float32Array(analyser.fftSize);

        const update = () => {

            window.requestAnimationFrame(update);
                
            analyser.getFloatTimeDomainData(floatArray);

            const fundalmentalFreq = Utils.autoCorrelate(floatArray, audioCtx.sampleRate);

            if (fundalmentalFreq === -1)
            {
                noteComponent.update({note: '?'});
                freqComponent.update(0);
                return;
            }

            const note = Utils.noteFromPitch(fundalmentalFreq);
            
            const noteSymbol = Utils.noteStrings[note % 12];

            const cents = Utils.centsOffFromPitch(fundalmentalFreq, note);

            console.log(`Note: ${note} (${noteSymbol}), Cents: ${Math.abs(cents)}, Freq: ${Math.round(fundalmentalFreq)}Hz`);

            noteComponent.update({note: noteSymbol});

            freqComponent.update(fundalmentalFreq);
        };

        update();
    },

    // Error callback
    function (err)
    {
        throw new Error('The following gUM error occured: ' + err);
    }
);






