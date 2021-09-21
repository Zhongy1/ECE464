export interface CircuitDescriptor {
  inputs: IODescriptor[],
  outputs: IODescriptor[],
  gates: GateDescriptor[],
  faults: FaultDescriptor[],
  parseError: boolean
}

export interface IODescriptor {
  node: CircuitNode
}

export interface GateDescriptor {
  outputNode: CircuitNode,
  gateType: GateType,
  params: CircuitNode[]
}

export interface FaultDescriptor {
  node: CircuitNode,
  value: NodeSignal
}

export type CircuitNode = string;

export enum NodeSignal {
  LOW, HIGH, DONTCARE, D, DNOT, UNKNOWN, UNTOUCHED
}

export type GateType = 'AND' | 'OR' | 'XOR' | 'NOT' | 'NAND' | 'NOR' | 'XNOR' | 'BUFF';

export interface Gate {
  gateType: GateType,
  inputs: CircuitNode[],
  output: CircuitNode,
  inputsReady: number,
  inputFault: boolean
}

export interface NodeInfo {
  type: string,
  val: string,
  logic: string,
  debug: string
}
export type CircuitTable = {[node: string]: NodeInfo}