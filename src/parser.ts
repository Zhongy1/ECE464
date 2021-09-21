
import {
  CircuitDescriptor,
  CircuitNode,
  GateDescriptor,
  GateType,
  IODescriptor
} from './models'

export class Parser {
  public static foo(input: string) {
    let inputLines = input.split('\n');
    for (let i = 0; i < inputLines.length; i++) {
      if (/^INPUT/.test(inputLines[i]) || /^OUTPUT/.test(inputLines[i])) {
        console.log(inputLines[i]);
      }
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

}

// /(?<=\(|, *)\w+'*|INPUT|OUTPUT|\w+'*(?= *= *)|(?<= *= *)\w+|^\#/