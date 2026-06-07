declare module 'drawflow' {
  class Drawflow {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(container: HTMLElement, ...args: any[]);
    reroute: boolean;
    reroute_fix_curvature: boolean;
    start(): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, callback: (...args: any[]) => void): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import(data: any): void;
    export(): any;
    addNode(name: string, inputs: number, outputs: number, pos_x: number, pos_y: number, classname: string, data: any, html: string): number;
    addConnection(id_output: number, id_input: number, output_class: string, input_class: string): void;
    addModule(name: string): void;
    changeModule(name: string): void;
    clear(): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getNodeFromId(id: number): any;
  }
  export default Drawflow;
}
