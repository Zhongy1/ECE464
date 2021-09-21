


import * as fs from 'fs'
import * as readline from 'readline-sync'
import { Parser } from './src/parser'
import { Circuit } from './src/circuit'
import {
  IODescriptor,
  NodeSignal
} from './src/models'

const hw1Bench: string = fs.readFileSync('./464benches/ex1q2.bench', {encoding:'utf8', flag:'r'});

let circDesc = Parser.parseBench(hw1Bench);
circDesc.faults.push({
  node: 'b',
  value: 1
})

let circuit: Circuit = new Circuit(circDesc);
// circuit.simulateWithInput(genRandomInputs(circDesc.inputs));

// let out = circuit.toString();
// fs.writeFileSync('out.txt', out);

console.table(circuit.toTable());

function genRandomInputs(inputList: IODescriptor[]): {[node: string]: NodeSignal} {
  let m: {[node: string]: NodeSignal} = {};
  inputList.forEach(input => {
    m[input.node] = Math.floor(Math.random()*2);
  });
  return m;
}

let quit = false;
while (!quit) {
  var inputStr = readline.question(`Enter input values:\n`);
  if (/quit/.test(inputStr)) {
    quit = true;
    continue;
  }
  else if (!/^[10]+(?!.)/.test(inputStr)) {
    console.log('Invalid input. Try again.');
    continue;
  }
  
  if (inputStr.length != Object.keys(circuit.inputs).length) {
    console.log('Input length does not match with the number of inputs in the circuit. Try again.');
    continue;
  }
  let r = circuit.simulateWithInput(inputStr);
  if (r) {
    console.table(circuit.toTable());
  }
  else {
    console.log('Error: There may be not enough inputs specified.');
  }
}