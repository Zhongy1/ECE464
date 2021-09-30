
import {
    CircuitDescriptor,
    CircuitNode,
    Fault,
    FaultDescriptor,
    FaultDetails,
    GateDescriptor,
    GateType,
    IODescriptor,
    NodeSignal
} from './models'

export class Parser {
    public static signalToSymbol(signal: NodeSignal): string {
        switch (signal) {
            case NodeSignal.D:
                return `D`;
            case NodeSignal.DNOT:
                return `D'`;
            case NodeSignal.DONTCARE:
                return `X`;
            case NodeSignal.UNKNOWN:
                return `U`;
            case NodeSignal.UNTOUCHED:
                return `_`;
            default:
                return signal.toString();
        }
    }

    public static parseBench(input: string): CircuitDescriptor {
        let inputLines = input.split('\n');
        let circDesc: CircuitDescriptor = {
            inputs: [],
            outputs: [],
            gates: [],
            faults: [],
            parseError: false
        }
        inputLines.forEach(line => {
            if (circDesc.parseError) return;
            line = line.trim();
            if (line === '' || /^\#/.test(line)) return;
            else if (/INPUT/.test(line)) {
                let node = line.match(/(?<=\(|, *)[\w]+'*/);
                if (node) {
                    let ioDesc: IODescriptor = {
                        node: node[0]
                    }
                    circDesc.inputs.push(ioDesc);
                }
                else circDesc.parseError = true;
            }
            else if (/OUTPUT/.test(line)) {
                let node = line.match(/(?<=\(|, *)[\w]+'*/);
                if (node) {
                    let ioDesc: IODescriptor = {
                        node: node[0]
                    }
                    circDesc.outputs.push(ioDesc);
                }
                else circDesc.parseError = true;
            }
            else if (/=/.test(line)) {
                let outputNode = line.match(/\w+'*(?= *= *)/);
                let gateType = line.match(/(?<= *= *)\w+/) as GateType[];
                let params = line.match(/(?<=\(|, *)\w+'*/g);
                if (outputNode && gateType && params) {
                    let gateDesc: GateDescriptor = {
                        outputNode: outputNode[0],
                        gateType: gateType[0],
                        params: params
                    }
                    circDesc.gates.push(gateDesc);
                }
                else circDesc.parseError = true;
            }
        });

        return circDesc;

    }

    public static parseFault(f: Fault): FaultDescriptor {
        let nodes = f.match(/[\w]+'*(?=-)/g)!;
        let val = f.match(/[01]$/)![0];
        let fd: FaultDescriptor = {
            node: (nodes.length > 1) ? nodes[1] : nodes[0],
            inputTo: (nodes.length > 1) ? nodes[0] : undefined,
            value: (val == '1') ? NodeSignal.HIGH : NodeSignal.LOW
        }
        return fd;
    }

    public static parseFaultList(faults: Fault[]): { [fault: Fault]: FaultDetails } {
        let r: { [fault: Fault]: FaultDetails } = {};
        faults.forEach((fault) => {
            r[fault] = {
                fault: fault,
                descriptor: this.parseFault(fault),
                groupId: -1,
                dominates: '',
                examined: false
            }
        });
        return r;
    }

}