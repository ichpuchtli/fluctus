declare namespace UIBuilder {
    class Component<P> {
        protected props: P;
        constructor(props: P);
        render(): HTMLElement;
    }
    interface Props {
        children?: any;
    }
    function createElement<P extends UIBuilder.Props>(type: any, props: P, ...children: any[]): HTMLElement | SVGElement;
}
declare namespace UIBuilder {
    function clone<T>(obj: T): T;
}
