declare module 'drawflow' {
  class Drawflow {
    constructor(container: HTMLElement, ...args: any[]);
    reroute: boolean;
    reroute_fix_curvature: boolean;
    start(): void;
    on(event: string, callback: (...args: any[]) => void): void;
    import(data: any): void;
    export(): any;
    addNode(name: string, inputs: number, outputs: number, pos_x: number, pos_y: number, classname: string, data: any, html: string): number;
    addConnection(id_output: number, id_input: number, output_class: string, input_class: string): void;
    addModule(name: string): void;
    changeModule(name: string): void;
    clear(): void;
    getNodeFromId(id: number): any;
  }
  export default Drawflow;
}
