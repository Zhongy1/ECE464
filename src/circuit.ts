
import {
    CircuitDescriptor,
    CircuitNode,
    CircuitTable,
    Fault,
    FaultCoverageDetails,
    FaultDescriptor,
    FaultDetails,
    FaultEquivalenceGroup,
    Gate,
    GateType,
    NodeInfo,
    NodeSignal,
    SCOAPInfo,
} from './models'
import { Parser } from './parser';

export class Circuit {
    public nodes!: { [node: CircuitNode]: NodeSignal };
    public inputs!: { [node: CircuitNode]: NodeSignal };
    public outputs!: { [node: CircuitNode]: NodeSignal };
    public faults!: { [node: CircuitNode]: NodeSignal };
    public gates!: { [node: CircuitNode]: Gate };
    public nodeToGatesMap!: { [node: CircuitNode]: Gate[] };
    public nodesSCOAP: { [node: CircuitNode]: SCOAPInfo }

    public numInputs!: number;
    public numOutputs!: number;
    public numNodes!: number;

    public possibleFaults: Fault[];
    public posFaultDetailsMap: { [fault: Fault]: FaultDetails };
    public faultEquivGroups!: FaultEquivalenceGroup[];

    constructor(public circDescriptor: CircuitDescriptor) {
        this.nodes = {};
        this.inputs = {};
        this.outputs = {};
        this.faults = {};
        this.gates = {};
        this.nodeToGatesMap = {};
        this.nodesSCOAP = {};
        this.initializeCircuit();
        this.possibleFaults = this.getAllPossibleFaults();
        this.posFaultDetailsMap = Parser.parseFaultList(this.possibleFaults);
        this.initializeFaultDetails(this.posFaultDetailsMap);
        this.initializeSCOAPDetails();
    }
    private initializeCircuit(): void {
        this.circDescriptor.inputs.forEach(ioDesc => {
            this.nodes[ioDesc.node] = NodeSignal.UNTOUCHED;
            this.inputs[ioDesc.node] = NodeSignal.UNTOUCHED;
            this.nodesSCOAP[ioDesc.node] = {
                c0: 0,
                c1: 0,
                n0: 0,
                n1: 0
            }
        });
        this.numInputs = this.circDescriptor.inputs.length;
        this.circDescriptor.outputs.forEach(ioDesc => {
            this.outputs[ioDesc.node] = NodeSignal.UNTOUCHED;
        });
        this.numOutputs = this.circDescriptor.outputs.length;
        this.circDescriptor.gates.forEach(gateDesc => {
            this.nodes[gateDesc.outputNode] = NodeSignal.UNTOUCHED;
            this.nodesSCOAP[gateDesc.outputNode] = {
                c0: 0,
                c1: 0,
                n0: 0,
                n1: 0
            }
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
        this.numNodes = Object.keys(this.nodes).length;
        this.circDescriptor.faults.forEach(faultDesc => {
            this.insertFault(faultDesc);
        });
    }

    public toString(): string {
        let g = ``;
        let gd = ``;
        Object.keys(this.gates).forEach(gKey => {
            g += `  {${this.gates[gKey].inputs}} -> ${this.gates[gKey].gateType} -> {${this.gates[gKey].output}}\n`;
            gd += `  {${this.gates[gKey].inputs.map(node => Parser.signalToSymbol(this.nodes[node]))}} -> ${this.gates[gKey].gateType} -> {${Parser.signalToSymbol(this.nodes[this.gates[gKey].output])}}\n`;
        });
        let f = ``;
        Object.keys(this.faults).forEach(fNode => {
            f += `  ${fNode} = ${Parser.signalToSymbol(this.faults[fNode])}\n`;
        });
        let i = ``;
        let iv = ``;
        Object.keys(this.inputs).forEach(iNode => {
            i += `  ${iNode}\n`;
            iv += `  ${iNode} = ${Parser.signalToSymbol(this.inputs[iNode])}\n`;
        });
        let o = ``;
        let ov = ``;
        Object.keys(this.outputs).forEach(oNode => {
            o += `  ${oNode}\n`;
            ov += `  ${oNode} = ${Parser.signalToSymbol(this.outputs[oNode])}\n`;
        });
        let allv = ``;
        Object.keys(this.nodes).forEach(node => {
            allv += `  ${node} = ${Parser.signalToSymbol(this.nodes[node])}\n`;
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

    public toTable(showCounts: boolean): CircuitTable {
        let t: CircuitTable = {};
        Object.keys(this.inputs).forEach(iNode => {
            let info = this.nodesSCOAP[iNode];
            t[iNode] = {
                // node: iNode,
                type: `Input`,
                // val: Parser.signalToSymbol(this.nodes[iNode]),
                logic: ``,
                c0: info.c0,
                c1: info.c1,
                // debug: ``
            }
            if (showCounts) {
                t[iNode].n0 = info.n0;
                t[iNode].n1 = info.n1;
            }
        });
        Object.keys(this.nodes).forEach(node => {
            if (t.hasOwnProperty(node) || this.outputs.hasOwnProperty(node)) return;
            let gate = this.gates[node];
            let info = this.nodesSCOAP[node];
            t[node] = {
                // node: node,
                type: `Internal`,
                // val: Parser.signalToSymbol(this.nodes[node]),
                logic: `${gate.gateType}(${gate.inputs})`,
                c0: info.c0,
                c1: info.c1,
                // debug: `{${gate.inputs.map(node => Parser.signalToSymbol(this.nodes[node]))}} -> ${gate.gateType} -> {${Parser.signalToSymbol(this.nodes[gate.output])}}`
            }
            if (showCounts) {
                t[node].n0 = info.n0;
                t[node].n1 = info.n1;
            }
        });
        Object.keys(this.outputs).forEach(oNode => {
            let gate = this.gates[oNode];
            let info = this.nodesSCOAP[oNode];
            if (gate) {
                t[oNode] = {
                    // node: oNode,
                    type: `Output`,
                    // val: Parser.signalToSymbol(this.nodes[oNode]),
                    logic: `${gate.gateType}(${gate.inputs})`,
                    c0: info.c0,
                    c1: info.c1,
                    // debug: `{${gate.inputs.map(node => Parser.signalToSymbol(this.nodes[node]))}} -> ${gate.gateType} -> {${Parser.signalToSymbol(this.nodes[gate.output])}}`
                }
                if (showCounts) {
                    t[oNode].n0 = info.n0;
                    t[oNode].n1 = info.n1;
                }
            }
            else {
                t[oNode] = {
                    // node: oNode,
                    type: `Output`,
                    // val: Parser.signalToSymbol(this.nodes[oNode]),
                    logic: ``,
                    c0: info.c0,
                    c1: info.c1,
                    // debug: `{${Parser.signalToSymbol(this.nodes[oNode])}}`
                }
                if (showCounts) {
                    t[oNode].n0 = info.n0;
                    t[oNode].n1 = info.n1;
                }
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

    private resetCounters(): void {
        Object.keys(this.nodesSCOAP).forEach(node => {
            let info = this.nodesSCOAP[node];
            info.n0 = 0;
            info.n1 = 0;
        });
    }

    private adjustDSignal(signal: NodeSignal, gateInpRelation: string, simGood: boolean): NodeSignal {
        let r = signal;
        if (signal == NodeSignal.D) {
            r = (simGood) ? NodeSignal.HIGH : NodeSignal.LOW;
        }
        else if (signal == NodeSignal.DNOT) {
            r = (simGood) ? NodeSignal.LOW : NodeSignal.HIGH;
        }
        if (this.faults.hasOwnProperty(gateInpRelation) && !simGood) {
            return this.faults[gateInpRelation];
        }
        return r;
    }

    private handleGateLogic(gate: Gate, simGood: boolean = true): NodeSignal {
        let r: NodeSignal = NodeSignal.UNKNOWN;
        if (gate.gateType === 'AND') {
            r = NodeSignal.HIGH;
            for (let i = 0; i < gate.inputs.length; i++) {
                let pS = this.adjustDSignal(this.nodes[gate.inputs[i]], `${gate.output}-${gate.inputs[i]}`, simGood);
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
        else if (gate.gateType === 'NAND') {
            r = NodeSignal.LOW;
            for (let i = 0; i < gate.inputs.length; i++) {
                let pS = this.adjustDSignal(this.nodes[gate.inputs[i]], `${gate.output}-${gate.inputs[i]}`, simGood);
                if (pS == NodeSignal.UNTOUCHED || pS == NodeSignal.UNKNOWN || pS == NodeSignal.DONTCARE) {
                    r = NodeSignal.UNKNOWN;
                }
                else if (pS == NodeSignal.LOW) {
                    r = NodeSignal.HIGH;
                    break;
                }
            }
        }
        else if (gate.gateType === 'OR') {
            r = NodeSignal.LOW;
            for (let i = 0; i < gate.inputs.length; i++) {
                let pS = this.adjustDSignal(this.nodes[gate.inputs[i]], `${gate.output}-${gate.inputs[i]}`, simGood);
                if (pS == NodeSignal.UNTOUCHED || pS == NodeSignal.UNKNOWN || pS == NodeSignal.DONTCARE) {
                    r = NodeSignal.UNKNOWN;
                }
                else if (pS == NodeSignal.HIGH) {
                    r = NodeSignal.HIGH;
                    break;
                }
            }
        }
        else if (gate.gateType === 'NOR') {
            r = NodeSignal.HIGH;
            for (let i = 0; i < gate.inputs.length; i++) {
                let pS = this.adjustDSignal(this.nodes[gate.inputs[i]], `${gate.output}-${gate.inputs[i]}`, simGood);
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
        else if (gate.gateType === 'XOR' || gate.gateType === 'XNOR') {
            r = NodeSignal.LOW;
            for (let i = 0; i < gate.inputs.length; i++) {
                let pS = this.adjustDSignal(this.nodes[gate.inputs[i]], `${gate.output}-${gate.inputs[i]}`, simGood);
                if (pS == NodeSignal.UNTOUCHED || pS == NodeSignal.UNKNOWN || pS == NodeSignal.DONTCARE) {
                    r = NodeSignal.UNKNOWN;
                    break;
                }
                else {
                    r ^= pS;
                }
            }
            if (gate.gateType === 'XNOR' && r <= NodeSignal.HIGH) {
                r = (r == NodeSignal.LOW) ? NodeSignal.HIGH : NodeSignal.LOW;
            }
        }
        else if (gate.gateType === 'NOT') {
            let pS = this.adjustDSignal(this.nodes[gate.inputs[0]], `${gate.output}-${gate.inputs[0]}`, simGood);
            if (pS == NodeSignal.UNTOUCHED || pS == NodeSignal.UNKNOWN || pS == NodeSignal.DONTCARE) {
                r = NodeSignal.UNKNOWN;
            }
            else {
                r = (pS == NodeSignal.LOW) ? NodeSignal.HIGH : NodeSignal.LOW;
            }
        }
        else if (gate.gateType === 'BUFF') {
            let pS = this.adjustDSignal(this.nodes[gate.inputs[0]], `${gate.output}-${gate.inputs[0]}`, simGood);
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
            if (gate.inputsReady == gate.inputs.length) { // if all inputs to gate are ready
                if (!gate.inputFault) { // check gate specific input faults; for collapsed, add (gates.length > 1)
                    gate.inputs.forEach(iNode => {
                        if (gate.inputFault) return;
                        let fLoc = `${gate.output}-${iNode}`;
                        if (this.faults.hasOwnProperty(fLoc)) {
                            gate.inputFault = true;
                        }
                    });
                }
                if (gate.inputFault) { // if there's a fault getting propagated, simulate good and bad circuit
                    let g = this.handleGateLogic(gate, true);
                    let b = this.handleGateLogic(gate, false);
                    if (g == NodeSignal.UNKNOWN || b == NodeSignal.UNKNOWN) {
                        // hopefully it never reaches here if inputs are known
                        this.nodes[gate.output] = NodeSignal.UNKNOWN;
                    }
                    else if (g != b) {
                        this.nodes[gate.output] = (g == NodeSignal.HIGH) ? NodeSignal.D : NodeSignal.DNOT;
                    }
                    else { // g == b
                        this.nodes[gate.output] = g;
                    }
                }
                else { // no fault getting propagated
                    // this.nodes[gate.output] = this.handleGateLogic(gate.gateType, gate.inputs);
                    this.nodes[gate.output] = this.handleGateLogic(gate);
                }
                if (this.faults.hasOwnProperty(gate.output)) { // output is computed, apply fault if it exists
                    let curVal = this.nodes[gate.output];
                    if (curVal == NodeSignal.UNKNOWN) {
                        // this.nodes[gate.output] = this.faults[gate.output];
                        // In this scenario, should it keep its unknown value? or use the value of the fault?
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
    public simulateWithInput(inputs: { [node: string]: NodeSignal }): boolean;
    public simulateWithInput(inputs: any): boolean {
        if (typeof inputs === 'string') { // string 0,1, or U
            if (inputs.length < Object.keys(this.inputs).length) return false;

            this.resetCircuit();

            let i = 0;
            Object.keys(this.inputs).forEach(iNode => {
                if (i < inputs.length) {
                    let ns: NodeSignal = (inputs[i] == '0') ? NodeSignal.LOW : (inputs[i] == '1') ? NodeSignal.HIGH : NodeSignal.UNKNOWN;
                    this.inputs[iNode] = ns;
                    this.nodes[iNode] = ns;
                    if (this.faults.hasOwnProperty(iNode) && this.nodes[iNode] != this.faults[iNode]) {
                        this.nodes[iNode] = (this.nodes[iNode] == NodeSignal.HIGH) ? NodeSignal.D : (this.nodes[iNode] == NodeSignal.LOW) ? NodeSignal.DNOT : this.nodes[iNode];
                    }
                    this.informGatesParamReady(iNode);
                    i++;
                }
            });
        }
        else {
            let inp = Object.keys(this.inputs); // map of input nodes and their values
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
                    this.nodes[iNode] = (this.nodes[iNode] == NodeSignal.HIGH) ? NodeSignal.D : (this.nodes[iNode] == NodeSignal.LOW) ? NodeSignal.DNOT : this.nodes[iNode];
                }
                this.informGatesParamReady(iNode);
            });
        }

        Object.keys(this.outputs).forEach(oNode => {
            this.outputs[oNode] = this.nodes[oNode];
        });

        if (Object.keys(this.faults).length == 0) {
            Object.keys(this.nodes).forEach(node => {
                let val = this.nodes[node];
                let info = this.nodesSCOAP[node];
                if (val == NodeSignal.LOW) {
                    info.n0++;
                }
                else if (val == NodeSignal.HIGH) {
                    info.n1++;
                }
            });
        }

        return true;
    }

    public isFaultDetected(): boolean {
        let oNodes = Object.keys(this.outputs);
        for (let i = 0; i < oNodes.length; i++) {
            if (this.outputs[oNodes[i]] == NodeSignal.D || this.outputs[oNodes[i]] == NodeSignal.DNOT)
                return true;
        }
        return false;
    }

    public insertFault(faultDesc: FaultDescriptor): void {
        if (!this.nodes.hasOwnProperty(faultDesc.node) || faultDesc.inputTo && !this.nodes.hasOwnProperty(faultDesc.inputTo) || faultDesc.value != NodeSignal.LOW && faultDesc.value != NodeSignal.HIGH) return;
        if (faultDesc.inputTo && this.nodeToGatesMap[faultDesc.node].length > 1) { // make sure there's a fan out from the node
            this.faults[faultDesc.inputTo + '-' + faultDesc.node] = faultDesc.value;
        }
        else {
            this.faults[faultDesc.node] = faultDesc.value;
        }
    }

    public clearFaults(): void {
        this.faults = {};
    }

    private getAllPossibleFaults(): Fault[] {
        let r: Fault[] = [];
        Object.keys(this.nodeToGatesMap).forEach(node => {
            r.push(`${node}-0`);
            r.push(`${node}-1`);
            // if (this.nodeToGatesMap[node].length > 1) {          // fault collapsing
            //     this.nodeToGatesMap[node].forEach(gate => {
            //         r.push(`${gate.output}-${node}-0`);
            //         r.push(`${gate.output}-${node}-1`);
            //     });
            // }
            this.nodeToGatesMap[node].forEach(gate => {             // no fault collapsing
                r.push(`${gate.output}-${node}-0`);
                r.push(`${gate.output}-${node}-1`);
            });
        });
        Object.keys(this.outputs).forEach(node => {
            r.push(`${node}-0`);
            r.push(`${node}-1`);
        })
        return r;
    }

    private isFaultEquivalent(valIn: NodeSignal, valOut: NodeSignal, gateType: GateType): boolean {
        if (gateType == 'AND') {
            return (valIn == NodeSignal.LOW && valOut == NodeSignal.LOW);
        }
        else if (gateType == 'OR') {
            return (valIn == NodeSignal.HIGH && valOut == NodeSignal.HIGH);
        }
        else if (gateType == 'NAND') {
            return (valIn == NodeSignal.LOW && valOut == NodeSignal.HIGH);
        }
        else if (gateType == 'NOR') {
            return (valIn == NodeSignal.HIGH && valOut == NodeSignal.LOW);
        }
        else if (gateType == 'NOT') {
            return (valIn == NodeSignal.HIGH && valOut == NodeSignal.LOW || valIn == NodeSignal.LOW && valOut == NodeSignal.HIGH);
        }
        else if (gateType == 'BUFF') {
            return (valIn == valOut);
        }
        else return false;
    }

    private canDominateFault(valIn: NodeSignal, valOut: NodeSignal, gateType: GateType): boolean {
        if (gateType == 'AND') {
            return (valIn == NodeSignal.HIGH && valOut == NodeSignal.HIGH);
        }
        else if (gateType == 'OR') {
            return (valIn == NodeSignal.LOW && valOut == NodeSignal.LOW);
        }
        else if (gateType == 'NAND') {
            return (valIn == NodeSignal.HIGH && valOut == NodeSignal.LOW);
        }
        else if (gateType == 'NOR') {
            return (valIn == NodeSignal.LOW && valOut == NodeSignal.HIGH);
        }
        else return false;
    }

    private initializeFaultDetails(map: { [fault: Fault]: FaultDetails }): void {
        let self = this;
        let faults = Object.keys(map);
        let id = 0;
        this.faultEquivGroups = [];
        function attemptGrouping(fault: Fault) {
            if (!map.hasOwnProperty(fault)) return;
            let fdet = map[fault];
            if (fdet.groupId >= 0) return;
            fdet.groupId = id;
            self.faultEquivGroups[id].coveredFaults.push(fault);
            if (!fdet.descriptor.inputTo) {
                var gateOutFrom: Gate | undefined = self.gates[fdet.descriptor.node];
            }
            else if (!self.inputs.hasOwnProperty(fdet.descriptor.node) && self.nodeToGatesMap[fdet.descriptor.node].length == 1) { // for non collapsed faults
                // This gate should already be handled; redundant to do so again.
                // var gateOutFrom: Gate | undefined = self.gates[fdet.descriptor.node];
            }
            if (fdet.descriptor.inputTo) {
                var gateInTo: Gate | undefined = self.gates[fdet.descriptor.inputTo];
            }
            else if (!self.outputs.hasOwnProperty(fdet.descriptor.node) && self.nodeToGatesMap[fdet.descriptor.node].length == 1) {
                var gateInTo: Gate | undefined = self.nodeToGatesMap[fdet.descriptor.node][0];
            }
            if (gateOutFrom) {
                gateOutFrom.inputs.forEach(iNode => {
                    // if (self.nodeToGatesMap[iNode].length == 1) {                                                                    // fault collapsing
                    //     let sa0 = `${iNode}-0`;
                    //     let sa1 = `${iNode}-1`;
                    //     if (self.isFaultEquivalent(map[sa0].descriptor.value, fdet.descriptor.value, gateOutFrom!.gateType))
                    //         attemptGrouping(sa0);
                    //     else if (self.isFaultEquivalent(map[sa1].descriptor.value, fdet.descriptor.value, gateOutFrom!.gateType))
                    //         attemptGrouping(sa1);
                    // }
                    // else {
                    //     let sa0 = `${gateOutFrom!.output}-${iNode}-0`;
                    //     let sa1 = `${gateOutFrom!.output}-${iNode}-1`;
                    //     if (self.isFaultEquivalent(map[sa0].descriptor.value, fdet.descriptor.value, gateOutFrom!.gateType))
                    //         attemptGrouping(sa0);
                    //     else if (self.isFaultEquivalent(map[sa1].descriptor.value, fdet.descriptor.value, gateOutFrom!.gateType))
                    //         attemptGrouping(sa1);
                    // }

                    if (self.nodeToGatesMap[iNode].length == 1) {                                                                       // no fault collapsing
                        let sa0 = `${iNode}-0`;
                        let sa1 = `${iNode}-1`;
                        if (self.isFaultEquivalent(map[sa0].descriptor.value, fdet.descriptor.value, gateOutFrom!.gateType))
                            attemptGrouping(sa0);
                        else if (self.isFaultEquivalent(map[sa1].descriptor.value, fdet.descriptor.value, gateOutFrom!.gateType))
                            attemptGrouping(sa1);
                    }
                    let sa0 = `${gateOutFrom!.output}-${iNode}-0`;
                    let sa1 = `${gateOutFrom!.output}-${iNode}-1`;
                    if (self.isFaultEquivalent(map[sa0].descriptor.value, fdet.descriptor.value, gateOutFrom!.gateType))
                        attemptGrouping(sa0);
                    else if (self.isFaultEquivalent(map[sa1].descriptor.value, fdet.descriptor.value, gateOutFrom!.gateType))
                        attemptGrouping(sa1);
                });
            }
            if (gateInTo) {
                let sa0 = `${gateInTo!.output}-0`;
                let sa1 = `${gateInTo!.output}-1`;
                if (self.canDominateFault(fdet.descriptor.value, map[sa0].descriptor.value, gateInTo!.gateType))
                    fdet.dominates = sa0;
                else if (self.canDominateFault(fdet.descriptor.value, map[sa1].descriptor.value, gateInTo!.gateType))
                    fdet.dominates = sa1;
                if (self.isFaultEquivalent(fdet.descriptor.value, map[sa0].descriptor.value, gateInTo!.gateType))
                    attemptGrouping(sa0);
                else if (self.isFaultEquivalent(fdet.descriptor.value, map[sa1].descriptor.value, gateInTo!.gateType))
                    attemptGrouping(sa1);
            }
        }
        faults.forEach(fault => {
            let fdet = map[fault];
            if (fdet.groupId >= 0) return;
            this.faultEquivGroups.push({
                id: id,
                coveredFaults: [],
                examined: false
            });
            attemptGrouping(fault);
            id++;
        });
    }

    private resetFaultDetails(): void {
        Object.keys(this.posFaultDetailsMap).forEach(fault => {
            this.posFaultDetailsMap[fault].examined = false;
        });
        this.faultEquivGroups.forEach(grp => {
            grp.examined = false;
        })
    }

    private getAllAssociatedFaultGroups(fault: Fault, collector: FaultEquivalenceGroup[]): void {
        let fdet = this.posFaultDetailsMap[fault];
        if (fdet.examined) return;
        let grp = this.faultEquivGroups[fdet.groupId];
        grp.coveredFaults.forEach(fault => {
            let fdeta = this.posFaultDetailsMap[fault];
            if (fdeta.examined) return;
            fdeta.examined = true;
            if (!fdeta.dominates) return;
            this.getAllAssociatedFaultGroups(fdeta.dominates, collector);
        });

        collector.push(grp);
    }

    public getFaultCoverageWithInputByGroups(inputStr: string, details?: FaultCoverageDetails): Fault[] {
        let oldFaults = this.faults;
        if (details) {
            details.testVector = inputStr;
        }

        let r: Fault[] = [];
        this.resetFaultDetails();
        this.possibleFaults.forEach(fault => {
            let fdet = this.posFaultDetailsMap[fault];
            if (fdet.examined) return;
            this.clearFaults();
            this.insertFault(Parser.parseFault(fault));
            this.simulateWithInput(inputStr);
            if (this.isFaultDetected()) {
                let grps: FaultEquivalenceGroup[] = [];
                this.getAllAssociatedFaultGroups(fault, grps);
                grps.forEach(grp => {
                    grp.coveredFaults.forEach(f => {
                        if (details && details.allOutputs) {
                            let o: { [node: CircuitNode]: NodeSignal } = {};
                            Object.keys(this.outputs).forEach(oNode => {
                                o[oNode] = this.outputs[oNode];
                            });
                            details.allOutputs[f] = o;
                        }
                        r.push(f);
                    });
                });
            }
        });
        this.resetFaultDetails();

        this.faults = oldFaults;

        if (details) {
            details.coveredFaults = r;
        }
        return r;
    }

    public getFaultCoverageWithInputIndividually(inputStr: string): Fault[] {
        let oldFaults = this.faults;

        let r: Fault[] = [];
        this.possibleFaults.forEach(fault => {
            this.clearFaults();
            this.insertFault(Parser.parseFault(fault));
            this.simulateWithInput(inputStr);
            if (this.isFaultDetected()) {
                r.push(fault);
            }
        });

        this.faults = oldFaults;
        return r;
    }

    public doAdditional4TVs(inputStr: string): string[] {
        let self = this;
        let oldFaults = this.faults;

        console.log('TV: ' + inputStr);
        let r: Fault[] = [];
        this.resetFaultDetails();
        doCoverage(inputStr);
        function doCoverage(iStr: string): void {
            self.possibleFaults.forEach(fault => {
                let fdet = self.posFaultDetailsMap[fault];
                if (fdet.examined) return;
                self.clearFaults();
                self.insertFault(Parser.parseFault(fault));
                self.simulateWithInput(iStr);
                if (self.isFaultDetected()) {
                    let grps: FaultEquivalenceGroup[] = [];
                    self.getAllAssociatedFaultGroups(fault, grps);
                    grps.forEach(grp => {
                        grp.coveredFaults.forEach(f => {
                            r.push(f);
                        })
                    });
                }
            });
        }
        function generateRandomTV(): string[] {
            let s = [];
            for (let i = 0; i < self.numInputs; i++) {
                s[i] = '' + Math.floor(Math.random() * 2);
            }
            return s;
        }
        function tryCoverage(iStr: string): Fault[] {
            let r: Fault[] = [];
            self.possibleFaults.forEach(fault => {
                let fdet = self.posFaultDetailsMap[fault];
                if (fdet.examined) return;
                self.clearFaults();
                self.insertFault(Parser.parseFault(fault));
                self.simulateWithInput(iStr);
                if (self.isFaultDetected()) {
                    let grps: FaultEquivalenceGroup[] = [];
                    self.getAllAssociatedFaultGroups(fault, grps);
                    grps.forEach(grp => {
                        grp.coveredFaults.forEach(f => {
                            r.push(f);
                        })
                    });
                }
            });
            r.forEach(fault => {
                self.posFaultDetailsMap[fault].examined = false;
            });
            return r;
        }
        function attemptOptimize(tv: string[]): void {
            if (self.possibleFaults.length > 2000) return;
            let inc = 1;
            if (self.numInputs > 36) {
                inc = Math.floor(self.numInputs / 36);
            }
            for (let i = 0; i < tv.length; i += inc) { // try to optimize random tvs
                tv[i] = '0';
                let cvg0 = tryCoverage(tv.join(''));
                tv[i] = '1';
                let cvg1 = tryCoverage(tv.join(''));
                if (cvg0.length == cvg1.length) {
                    tv[i] = '' + Math.floor(Math.random() * 2);
                }
                else if (cvg0.length > cvg1.length) {
                    tv[i] = '0';
                }
                else if (cvg0.length < cvg1.length) {
                    tv[i] = '1';
                }
            }
        }

        let all0s = [];
        for (let i = 0; i < this.numInputs; i++) {
            all0s.push('0');
        }
        attemptOptimize(all0s);
        console.log('TV: ' + all0s.join(''));
        doCoverage(all0s.join(''));

        for (let i = 0; i < 3; i++) { // 3 random tvs
            let tv = generateRandomTV();
            attemptOptimize(tv);
            console.log('TV: ' + tv.join(''));
            doCoverage(tv.join(''));
        }

        this.faults = oldFaults;
        return r;
    }

    private handleGateControllability(gate: Gate, signal: NodeSignal.LOW | NodeSignal.HIGH): number {
        if (gate.gateType === 'AND') {
            if (signal == NodeSignal.LOW) {
                let val = this.nodesSCOAP[gate.inputs[0]].c0;
                for (let i = 1; i < gate.inputs.length; i++) {
                    val = Math.min(this.nodesSCOAP[gate.inputs[i]].c0, val);
                }
                return val + 1;
            }
            else if (signal == NodeSignal.HIGH) {
                let val = this.nodesSCOAP[gate.inputs[0]].c1;
                for (let i = 1; i < gate.inputs.length; i++) {
                    val += this.nodesSCOAP[gate.inputs[i]].c1;
                }
                return val + 1;
            }
        }
        else if (gate.gateType === 'NAND') {
            if (signal == NodeSignal.LOW) {
                let val = this.nodesSCOAP[gate.inputs[0]].c1;
                for (let i = 1; i < gate.inputs.length; i++) {
                    val += this.nodesSCOAP[gate.inputs[i]].c1;
                }
                return val + 1;
            }
            else if (signal == NodeSignal.HIGH) {
                let val = this.nodesSCOAP[gate.inputs[0]].c0;
                for (let i = 1; i < gate.inputs.length; i++) {
                    val = Math.min(this.nodesSCOAP[gate.inputs[i]].c0, val);
                }
                return val + 1;
            }
        }
        else if (gate.gateType === 'OR') {
            if (signal == NodeSignal.LOW) {
                let val = this.nodesSCOAP[gate.inputs[0]].c0;
                for (let i = 1; i < gate.inputs.length; i++) {
                    val += this.nodesSCOAP[gate.inputs[i]].c0;
                }
                return val + 1;
            }
            else if (signal == NodeSignal.HIGH) {
                let val = this.nodesSCOAP[gate.inputs[0]].c1;
                for (let i = 1; i < gate.inputs.length; i++) {
                    val = Math.min(this.nodesSCOAP[gate.inputs[i]].c1, val);
                }
                return val + 1;
            }
        }
        else if (gate.gateType === 'NOR') {
            if (signal == NodeSignal.LOW) {
                let val = this.nodesSCOAP[gate.inputs[0]].c1;
                for (let i = 1; i < gate.inputs.length; i++) {
                    val = Math.min(this.nodesSCOAP[gate.inputs[i]].c1, val);
                }
                return val + 1;
            }
            else if (signal == NodeSignal.HIGH) {
                let val = this.nodesSCOAP[gate.inputs[0]].c0;
                for (let i = 1; i < gate.inputs.length; i++) {
                    val += this.nodesSCOAP[gate.inputs[i]].c0;
                }
                return val + 1;
            }
        }
        else if (gate.gateType === 'XOR') {
            let val = 1;
            let minDiff = Number.MAX_VALUE;
            let even1s = true;
            for (let i = 0; i < gate.inputs.length; i++) {
                let info = this.nodesSCOAP[gate.inputs[i]];
                val += Math.min(info.c0, info.c1);
                if (info.c1 < info.c0) {
                    even1s != even1s;
                }
                minDiff = Math.min(minDiff, Math.abs(info.c0 - info.c1));
            }
            if (signal == NodeSignal.LOW) {
                if (even1s) {
                    return val;
                }
                return val + minDiff;
            }
            else if (signal == NodeSignal.HIGH) {
                if (even1s) {
                    return val + minDiff;
                }
                return val;
            }
        }
        else if (gate.gateType === 'XNOR') {
            let val = 1;
            let minDiff = Number.MAX_VALUE;
            let even1s = true;
            for (let i = 0; i < gate.inputs.length; i++) {
                let info = this.nodesSCOAP[gate.inputs[i]];
                val += Math.min(info.c0, info.c1);
                if (info.c1 < info.c0) {
                    even1s != even1s;
                }
                minDiff = Math.min(minDiff, Math.abs(info.c0 - info.c1));
            }
            if (signal == NodeSignal.LOW) {
                if (even1s) {
                    return val + minDiff;
                }
                return val;
            }
            else if (signal == NodeSignal.HIGH) {
                if (even1s) {
                    return val;
                }
                return val + minDiff;
            }
        }
        else if (gate.gateType === 'NOT') {
            if (signal == NodeSignal.LOW) {
                return this.nodesSCOAP[gate.inputs[0]].c1 + 1;
            }
            else if (signal == NodeSignal.HIGH) {
                return this.nodesSCOAP[gate.inputs[0]].c0 + 1;
            }
        }
        else if (gate.gateType === 'BUFF') {
            if (signal == NodeSignal.LOW) {
                return this.nodesSCOAP[gate.inputs[0]].c0 + 1;
            }
            else if (signal == NodeSignal.HIGH) {
                return this.nodesSCOAP[gate.inputs[0]].c1 + 1;
            }
        }
        return 0;
    }

    private informGatesCtrlReady(node: CircuitNode): void {
        let gates = this.nodeToGatesMap[node];
        gates.forEach(gate => {
            gate.inputsReady++;
            if (gate.inputsReady == gate.inputs.length) {
                let info = this.nodesSCOAP[gate.output];
                info.c0 = this.handleGateControllability(gate, NodeSignal.LOW);
                info.c1 = this.handleGateControllability(gate, NodeSignal.HIGH);

                if (!this.outputs.hasOwnProperty(gate.output)) {
                    this.informGatesCtrlReady(gate.output);
                }
            }
        });
    }

    private initializeSCOAPDetails(): void {
        Object.keys(this.inputs).forEach(iNode => {
            let info = this.nodesSCOAP[iNode];
            info.c0 = 1;
            info.c1 = 1;
            this.informGatesCtrlReady(iNode);
        });

        this.resetCircuit();
    }
}