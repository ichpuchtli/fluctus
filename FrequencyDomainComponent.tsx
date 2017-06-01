
import {Component} from './Component';

export class FrequencyDomainComponent implements Component
{
    el: SVGSVGElement
    polyline: SVGPolylineElement;

    startTime: Date;

    constructor()
    {
        this.polyline = <polyline points="0,2000" stroke="cyan" fill="none" style={{strokeWidth: '3px'}} vector-effect="non-scaling-stroke" />;

        this.el = (
        <svg viewBox={'0 0 3000 300'} style={{width:'100%', height:'100vh'}}>
            {this.polyline}
        </svg>);

        this.startTime = new Date();
    }

    get bbox()
    {
        return this.el.viewBox.baseVal;
    }

    update(frequency: number)
    {
        var x = new Date().getTime() - this.startTime.getTime() + this.bbox.width;

        if(frequency != 0)
        {
            this.polyline.points.appendItem(this.newSvgPoint(x, this.bbox.height - frequency));
        }

        this.el.viewBox.baseVal.x = x - this.bbox.width
    }

    public newSvgPoint(x: number, y: number)
    {
        var p = this.el.createSVGPoint();
        p.x = x;
        p.y = y;
        return p;
    }
}