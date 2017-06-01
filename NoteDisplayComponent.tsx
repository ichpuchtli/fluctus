/// <reference path="cssproperties.d.ts" />


import {Component} from './Component';

export class NoteDisplayComponent implements Component
{
    public el: HTMLElement;

    constructor()
    {
        this.el = (<span className={'note'}>?</span>);
    }

    update({note}: {note: string})
    {
        if (this.el.textContent !== note)
        {
            this.el.textContent = note;
        }
    }
}
