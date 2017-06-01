
/// <reference path="uibuilder-1.4.3.d.ts" />
/// <reference path="cssproperties.d.ts" />

export interface Component
{
    el : HTMLElement|SVGElement;
}

export function mount(parent: Node|SVGElement, component: Component)
{
    parent.appendChild(component.el);
}

