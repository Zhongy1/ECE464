
import {
  CircuitDescriptor,
  CircuitNode,
  CircuitTable,
  Gate,
  GateType,
  NodeInfo,
  NodeSignal,
} from './models'

export class Circuit {
  public nodes!: {[node: string]: NodeSignal};
  public inputs!: {[node: string]: NodeSignal};
  public outputs!: {[node: string]: NodeSignal};
  public faults!: {[node: string]: NodeSignal};
  public gates!: {[node: string]: Gate};
  public nodeToGatesMap!: {[node: string]: Gate[]};

  constructor(public circDescriptor: CircuitDescriptor) {
    this.nodes = {};
    this.inputs = {};
    this.outputs = {};
    this.faults = {};
    this.gates = {};
    this.nodeToGatesMap = {};
    this.initializeCircuit();
  }
  private initializeCircuit(): void {
    this.circDescriptor.inputs.forEach(ioDesc => {
      this.nodes[ioDesc.node] = NodeSignal.UNTOUCHED;
      this.inputs[ioDesc.node] = NodeSignal.UNTOUCHED;
    });
    this.circDescriptor.outputs.forEach(ioDesc => {
      this.outputs[ioDesc.node] = NodeSignal.UNTOUCHED;
    });
    this.circDescriptor.gates.forEach(gateDesc => {
      this.nodes[gateDesc.outputNode] = NodeSignal.UNTOUCHED;
      this.gates[gateDesc.outputNode] = {
        gateType: gateDesc.gateType,
        inputs: gateDesc.params,
        output: gateDesc.outputNode,
        inputsReady: 0,
        inputFault: false
      }
      gateDesc.params.forEach(node => {
        if (this.nodeToGatesMap.hasOwnProperty(node)) {
          this.nodeToGatesMap[node].push(this.gates[gateDesc.outputNode]);
        }
        else {
          this.nodeToGatesMap[node] = [this.gates[gateDesc.outputNode]];
        }
      });
    });
    this.circDescriptor.faults.forEach(faultDesc => {
      this.faults[faultDesc.node] = faultDesc.value;
    });
  }

  private signalToSymbol(signal: NodeSignal): string {
    switch (signal) {
      case NodeSignal.D:
        return `D`;
        break;
      case NodeSignal.DNOT:
        return `D'`;
        break;
      case NodeSignal.DONTCARE:
        return `X`;
        break;
      case NodeSignal.UNKNOWN:
        return `U`;
        break;
      case NodeSignal.UNTOUCHED:
        return `_`;
        break;
      default:
        return signal.toString();
        break;
    }
  }

  public toString(): string {
    let g = ``;
    let gd = ``;
    Object.keys(this.gates).forEach(gKey => {
      g += `  {${this.gates[gKey].inputs}} -> ${this.gates[gKey].gateType} -> {${this.gates[gKey].output}}\n`;
      gd += `  {${this.gates[gKey].inputs.map(node => this.signalToSymbol(this.nodes[node]))}} -> ${this.gates[gKey].gateType} -> {${this.signalToSymbol(this.nodes[this.gates[gKey].output])}}\n`;
    });
    let f = ``;
    Object.keys(this.faults).forEach(fNode => {
      f += `  ${fNode} = ${this.signalToSymbol(this.faults[fNode])}\n`;
    });
    let i = ``;
    let iv = ``;
    Object.keys(this.inputs).forEach(iNode => {
      i += `  ${iNode}\n`;
      iv += `  ${iNode} = ${this.signalToSymbol(this.inputs[iNode])}\n`;
    });
    let o = ``;
    let ov = ``;
    Object.keys(this.outputs).forEach(oNode => {
      o += `  ${oNode}\n`;
      ov += `  ${oNode} = ${this.signalToSymbol(this.outputs[oNode])}\n`;
    });
    let allv = ``;
    Object.keys(this.nodes).forEach(node => {
      allv += `  ${node} = ${this.signalToSymbol(this.nodes[node])}\n`;
    });
    let s = `Input nodes: {\n${i}}\n` +
            `Output nodes: {\n${o}}\n` +
            `Gates: {\n${g}}\n` +
            `Gate debug: {\n${gd}}\n` +
            `Faults: {\n${f}}\n` +
            `Input node values: {\n${iv}}\n` +
            `Output node values: {\n${ov}}\n` +
            `All node values: {\n${allv}}\n`
    return s;
  }

  public toTable(): CircuitTable {
    let t: CircuitTable = {};
    Object.keys(this.inputs).forEach(iNode => {
      t[iNode] = {
        type: `Input`,
        val: this.signalToSymbol(this.nodes[iNode]),
        logic: ``,
        debug: ``
      }
    });
    Object.keys(this.nodes).forEach(node => {
      if (t.hasOwnProperty(node) || this.outputs.hasOwnProperty(node)) return;
      let gate = this.gates[node];
      t[node] = {
        type: `Internal`,
        val: this.signalToSymbol(this.nodes[node]),
        logic: `${gate.gateType}(${gate.inputs})`,
        debug: `{${gate.inputs.map(node => this.signalToSymbol(this.nodes[node]))}} -> ${gate.gateType} -> {${this.signalToSymbol(this.nodes[gate.output])}}`
      }
    });
    Object.keys(this.outputs).forEach(oNode => {
      let gate = this.gates[oNode];
      t[oNode] = {
        type: `Output`,
        val: this.signalToSymbol(this.nodes[oNode]),
        logic: `${gate.gateType}(${gate.inputs})`,
        debug: `{${gate.inputs.map(node => this.signalToSymbol(this.nodes[node]))}} -> ${gate.gateType} -> {${this.signalToSymbol(this.nodes[gate.output])}}`
      }
    });
    return t;
  }

  private resetCircuit(): void {
    Object.keys(this.gates).forEach(gKey => {
      let gate = this.gates[gKey]
      gate.inputsReady = 0;
      gate.inputFault = false;
    });
    Object.keys(this.inputs).forEach(iNode => {
      this.inputs[iNode] = NodeSignal.UNTOUCHED;
    });
    Object.keys(this.outputs).forEach(oNode => {
      this.outputs[oNode] = NodeSignal.UNTOUCHED;
    });
    Object.keys(this.nodes).forEach(node => {
      this.nodes[node] = NodeSignal.UNTOUCHED;
    });
  }

  private adjustDSignal(signal: NodeSignal, simGood: boolean): NodeSignal {
    if (signal == NodeSignal.D) {
      return (simGood) ? NodeSignal.HIGH : NodeSignal.LOW;
    }
    else if (signal == NodeSignal.DNOT) {
      return (simGood) ? NodeSignal.LOW : NodeSignal.HIGH;
    }
    return signal;
  }

  private handleGateLogic(gateType: GateType, params: CircuitNode[], simGood: boolean = true): NodeSignal {
    let r: NodeSignal = NodeSignal.UNKNOWN;
    if (gateType === 'AND') {
      r = NodeSignal.HIGH;
      for (let i = 0; i < params.length; i++) {
        let pS = this.adjustDSignal(this.nodes[params[i]], simGood);
        if (pS == NodeSignal.UNTOUCHED || pS == NodeSignal.UNKNOWN || pS == NodeSignal.DONTCARE) {
          r = NodeSignal.UNKNOWN;
          break;
        }
        else if (pS == NodeSignal.LOW) {
          r = NodeSignal.LOW;
          break;
        }
      }
    }
    else if (gateType === 'NAND') {
      r = NodeSignal.LOW;
      for (let i = 0; i < params.length; i++) {
        let pS = this.adjustDSignal(this.nodes[params[i]], simGood);
        if (pS == NodeSignal.UNTOUCHED || pS == NodeSignal.UNKNOWN || pS == NodeSignal.DONTCARE) {
          r = NodeSignal.UNKNOWN;
        }
        else if (pS == NodeSignal.LOW) {
          r = NodeSignal.HIGH;
          break;
        }
      }
    }
    else if (gateType === 'OR') {
      r = NodeSignal.LOW;
      for (let i = 0; i < params.length; i++) {
        let pS = this.adjustDSignal(this.nodes[params[i]], simGood);
        if (pS == NodeSignal.UNTOUCHED || pS == NodeSignal.UNKNOWN || pS == NodeSignal.DONTCARE) {
          r = NodeSignal.UNKNOWN;
        }
        else if (pS == NodeSignal.HIGH) {
          r = NodeSignal.HIGH;
          break;
        }
      }
    }
    if (gateType === 'NOR') {
      r = NodeSignal.HIGH;
      for (let i = 0; i < params.length; i++) {
        let pS = this.adjustDSignal(this.nodes[params[i]], simGood);
        if (pS == NodeSignal.UNTOUCHED || pS == NodeSignal.UNKNOWN || pS == NodeSignal.DONTCARE) {
          r = NodeSignal.UNKNOWN;
          break;
        }
        else if (pS == NodeSignal.HIGH) {
          r = NodeSignal.LOW;
          break;
        }
      }
    }
    else if (gateType === 'XOR' || gateType === 'XNOR') {
      r = NodeSignal.LOW;
      for (let i = 0; i < params.length; i++) {
        let pS = this.adjustDSignal(this.nodes[params[i]], simGood);
        if (pS == NodeSignal.UNTOUCHED || pS == NodeSignal.UNKNOWN || pS == NodeSignal.DONTCARE) {
          r = NodeSignal.UNKNOWN;
          break;
        }
        else {
          r ^= pS;
        }
      }
      if (gateType === 'XNOR' && r <= NodeSignal.HIGH) {
        r = (r == NodeSignal.LOW) ? NodeSignal.HIGH : NodeSignal.LOW;
      }
    }
    else if (gateType === 'NOT') {
      let pS = this.adjustDSignal(this.nodes[params[0]], simGood);
      if (pS == NodeSignal.UNTOUCHED || pS == NodeSignal.UNKNOWN || pS == NodeSignal.DONTCARE) {
        r = NodeSignal.UNKNOWN;
      }
      else {
        r = (pS == NodeSignal.LOW) ? NodeSignal.HIGH : NodeSignal.LOW;
      }
    }
    else if (gateType === 'BUFF') {
      let pS = this.adjustDSignal(this.nodes[params[0]], simGood);
      if (pS == NodeSignal.UNTOUCHED || pS == NodeSignal.UNKNOWN || pS == NodeSignal.DONTCARE) {
        r = NodeSignal.UNKNOWN;
      }
      else {
        r = pS;
      }
    }
    return r;
  }

  private informGatesParamReady(node: CircuitNode): void {
    let inputFault = this.nodes[node] == NodeSignal.D || this.nodes[node] == NodeSignal.DNOT;
    let gates = this.nodeToGatesMap[node];
    gates.forEach(gate => {
      if (!gate.inputFault && inputFault) gate.inputFault = inputFault;
      gate.inputsReady++;
      if (gate.inputsReady == gate.inputs.length) {
        if (gate.inputFault) {
          let g = this.handleGateLogic(gate.gateType, gate.inputs, true);
          let b = this.handleGateLogic(gate.gateType, gate.inputs, false);
          if (g == NodeSignal.UNKNOWN || b == NodeSignal.UNKNOWN) {
            // hopefully it never reaches here
            this.nodes[gate.output] = NodeSignal.UNKNOWN;
          }
          else if (g != b) {
            this.nodes[gate.output] = (g == NodeSignal.HIGH) ? NodeSignal.D : NodeSignal.DNOT;
          }
          else { // g == b
            this.nodes[gate.output] = g;
          }
        }
        else {
          this.nodes[gate.output] = this.handleGateLogic(gate.gateType, gate.inputs);
        }
        if (this.faults.hasOwnProperty(gate.output)) {
          let curVal = this.nodes[gate.output];
          if (curVal == NodeSignal.UNKNOWN) {
            this.nodes[gate.output] = this.faults[gate.output];
          }
          else if (this.faults[gate.output] == NodeSignal.HIGH) {
            if (curVal == NodeSignal.LOW) {
              this.nodes[gate.output] = NodeSignal.DNOT;
            }
            else if (curVal == NodeSignal.D) {
              this.nodes[gate.output] = NodeSignal.HIGH;
            }
          }
          else if (this.faults[gate.output] == NodeSignal.LOW) {
            if (curVal == NodeSignal.HIGH) {
              this.nodes[gate.output] = NodeSignal.D;
            }
            else if (curVal == NodeSignal.DNOT) {
              this.nodes[gate.output] = NodeSignal.LOW;
            }
          }
        }
        if (!this.outputs.hasOwnProperty(gate.output)) {
          this.informGatesParamReady(gate.output);
        }
      }
    });
  }
  
  public simulateWithInput(inputStr: string): boolean;
  public simulateWithInput(inputs: {[node: string]: NodeSignal}): boolean;
  public simulateWithInput(inputs: any): boolean {
    if (typeof inputs === 'string') {
      if (inputs.length < Object.keys(this.inputs).length) return false;

      this.resetCircuit();
      
      let i = 0;
      Object.keys(this.inputs).forEach(iNode => {
        if (i < inputs.length) {
          this.inputs[iNode] = parseInt(inputs[i]);
          this.nodes[iNode] = parseInt(inputs[i]);
          if (this.faults.hasOwnProperty(iNode) && this.nodes[iNode] != this.faults[iNode]) {
            this.nodes[iNode] = (this.nodes[iNode] == NodeSignal.HIGH) ? NodeSignal.D : NodeSignal.DNOT;
          }
          this.informGatesParamReady(iNode);
          i++;
        }
      });
      return true;
    }
    else {
      let inp = Object.keys(this.inputs);
      for (let i = 0; i < inp.length; i++) {
        if (!inputs.hasOwnProperty(inp[i])) {
          return false;
        }
      }

      this.resetCircuit();

      inp.forEach(iNode => {
        this.inputs[iNode] = inputs[iNode];
        this.nodes[iNode] = inputs[iNode];
        if (this.faults.hasOwnProperty(iNode) && this.nodes[iNode] != this.faults[iNode]) {
          this.nodes[iNode] = (this.nodes[iNode] == NodeSignal.HIGH) ? NodeSignal.D : NodeSignal.DNOT;
        }
        this.informGatesParamReady(iNode);
      });

      Object.keys(this.outputs).forEach(oNode => {
        this.outputs[oNode] = this.nodes[oNode];
      });

      return true;
    }
  }
}