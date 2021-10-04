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
    inputTo?: CircuitNode,
    value: NodeSignal
}

export interface FaultDetails {
    fault: Fault,
    descriptor: FaultDescriptor,

    groupId: number,

    dominates: Fault,

    examined: boolean
}

export interface FaultEquivalenceGroup {
    id: number,
    coveredFaults: Fault[],
    examined: boolean
}

export interface FaultCoverageDetails {
    testVector: string,
    allOutputs?: { [fault: Fault]: { [node: CircuitNode]: NodeSignal } },
    coveredFaults: Fault[],
    // coveredGroupIds: number[]
}

export type CircuitNode = string;

export type Fault = string;

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
    node?: string,
    type: string,
    val: string,
    logic: string,
    debug: string
}
export type CircuitTable = { [node: string]: NodeInfo }