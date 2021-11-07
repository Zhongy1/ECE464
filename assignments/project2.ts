import * as fs from 'fs';
import { Circuit } from '../src/circuit';
import { CLI } from "../src/cli";
import { Menu } from "../src/cli-models";
import { CircuitDescriptor, CircuitTable } from '../src/models';
import { Parser } from '../src/parser';

export class Project2 {
    public menuOptions!: Menu[];
    public cli: CLI;

    public circuit?: Circuit;
    public testVectors?: string[];
    public table?: CircuitTable;

    constructor() {
        this.initMenuOptions();
        this.cli = new CLI(this.menuOptions, this.menuOptions[0].id);
    }

    private initMenuOptions(): void {
        this.menuOptions = [
            {
                id: 'A',
                prompt: 'Select bench file',
                inRegex: /^.+\.bench$/,
                inValue: '',
                default: 'p2.bench',
                menuTransitions: [
                    {
                        trigger: /^.+\.bench$/,
                        transition: (cli: CLI) => {
                            let bench = this.getBenchFile(cli.getValueFromCurrentMenu());
                            if (bench) {
                                try {
                                    this.initCircuit(Parser.parseBench(bench));
                                }
                                catch (err) {
                                    cli.printError('An error occured while parcing file. Terminating...');
                                    return 'q';
                                }
                                this.printCircuitInfo(false);
                                return 'B';
                            }
                            else {
                                cli.printError('Specified file does not exist or is empty');
                                return 'A';
                            }
                        }
                    }
                ],
                transitionIndex: -1
            },
            {
                id: 'B',
                prompt: 'Hit enter to continue...',
                inRegex: /^$/,
                inValue: '',
                default: '',
                menuTransitions: [
                    {
                        trigger: /^$/,
                        transition: (cli: CLI) => {
                            cli.printInfo('\nNumber of inputs: ' + this.circuit!.numInputs + '\n' +
                                ((this.circuit!.numInputs > 10) ? `Using Monte-Carlo simulation technique (${this.circuit!.numInputs} > 10)` : `Using exhaustive simulation technique (${this.circuit!.numInputs} <= 10)`) + '\n' +
                                'Number of test vectors: ' + ((this.circuit!.numInputs > 10) ? '1000' : (2 ** this.circuit!.numInputs)));
                            this.testVectors = this.generateTestVectors(this.circuit!.numInputs);
                            this.testVectors.forEach(tv => {
                                this.circuit!.simulateWithInput(tv);
                            });
                            this.table = this.printCircuitInfo(true)!;
                            return 'C';
                        }
                    }
                ],
                transitionIndex: -1
            },
            {
                id: 'C',
                prompt: 'Hit enter to continue...',
                inRegex: /^$/,
                inValue: '',
                default: '',
                menuTransitions: [
                    {
                        trigger: /^$/,
                        transition: (cli: CLI) => {
                            let a: { [key: string]: { c: number, n: number, type: string } } = {};
                            let maxCol = 90;
                            let rows = 16;
                            let largestc = 0;
                            let largestn = 0;
                            let largestcInv = 0;
                            let largestnInv = 0;
                            let nodesUsed = 0;
                            let nodes = Object.keys(this.table!);
                            nodes.forEach(node => {
                                if (nodes.length > 90 && this.table![node].type != 'Output' || nodesUsed >= maxCol) return;
                                let c = this.table![node].c0! / this.table![node].c1!;
                                let n = this.table![node].n1! / this.table![node].n0!;
                                largestc = Math.max(c, largestc);
                                largestn = Math.max(n, largestn);
                                largestcInv = Math.max(1 / c, largestcInv);
                                largestnInv = Math.max(1 / n, largestnInv);
                                a[node] = { c: c, n: n, type: this.table![node].type }
                                nodesUsed++;
                            });
                            cli.printInfo(`\nFollowing graphs are prone to divide by 0 errors, in which case, graph becomes invalid.\n` +
                                `To try to fit graphs into terminal, graphs will use...\n` +
                                `  all nodes if number of nodes <= ${maxCol}\n` +
                                `  only output nodes if number of nodes > ${maxCol}\n` +
                                `  only ${maxCol} output nodes if number of output nodes > ${maxCol}`);
                            this.printGraphs(a, rows, largestc, largestn, largestcInv, largestnInv);
                            console.log();
                            cli.printInfo('\nQualitative analysis:\nQ1: Is\n  c0 < c1 corresponding to n0 > n1? or\n  c0 > c1 corresponding to n0 < n1? or\n  c0 == c1 corresponding to abs(n0 - numTVs/2) < numTVs/20?\n' +
                                'Quantitative analysis:\nQ2: Calculate c0/c1 and n1/n0\n  To avoid divide by zero errors, 1 will be used to substitute 0');
                            let b: { [key: string]: { comparison: string, Q1: string, "c0/c1": number, "n1/n0": number } } = {};
                            nodes.forEach(node => {
                                if (this.table![node].type != 'Output') return;
                                let info = this.table![node];
                                b[node] = {
                                    comparison: `C: ${info.c0} ${(info.c0! < info.c1!) ? '<' : (info.c0! > info.c1!) ? '>' : '=='} ${info.c1} N: ${info.n0} ${(info.n0! > info.n1!) ? '>' : (info.n0! < info.n1!) ? '<' : '=='} ${info.n1}`,
                                    Q1: `${(info.c0! < info.c1! && info.n0! > info.n1! || info.c0! > info.c1! && info.n0! < info.n1! || info.c0! == info.c1! && info.n0! == info.n1! || info.c0! == info.c1! && Math.abs(info.n0! - this.testVectors!.length / 2) < this.testVectors!.length / 20) ? 'Yes' : 'No'}`,
                                    "c0/c1": Number((info.c0! / info.c1!).toFixed(4)),
                                    "n1/n0": Number((info.n1! / info.n0!).toFixed(4))
                                }
                            });
                            console.table(b);

                            return 'D';
                        }
                    }
                ],
                transitionIndex: -1
            },
            {
                id: 'D',
                prompt: 'Hit enter to select another bench file. Or q to quit',
                inRegex: /^$/,
                inValue: '',
                default: '',
                menuTransitions: [
                    {
                        trigger: /^$/,
                        transition: 'A'
                    }
                ],
                transitionIndex: -1
            }
        ]
    }

    public main(): void {
        this.cli.run();
    }

    private getBenchFile(fileName: string): string {
        if (!fs.existsSync(`./464benches/${fileName}`)) return '';
        return fs.readFileSync(`./464benches/${fileName}`, { encoding: 'utf8', flag: 'r' });
    }

    private initCircuit(circDesc: CircuitDescriptor): void {
        this.circuit = new Circuit(circDesc);
    }

    public printCircuitInfo(showCounts: boolean): CircuitTable | null {
        if (this.circuit) {
            let t = this.circuit!.toTable(showCounts);
            let nodes = Object.keys(t);
            // let oTable: any = {};
            // if (nodes.length > 50) {
            //     nodes.forEach(node => {
            //         if (t[node].type == 'Output') {
            //             oTable[node] = t[node];
            //         }
            //     });
            // }
            // else oTable = t;
            // console.table(oTable);
            console.table(t);
            return t;
        }
        else {
            console.log('Circuit has not been initialized...')
            return null;
        }
    }

    public printGraphs(a: { [key: string]: { c: number, n: number, type: string } }, rows: number, largestc: number, largestn: number, largestcInv: number, largestnInv: number): void {
        if (this.circuit) {
            let aKeys = Object.keys(a);
            let out = '\x1b[40m\x1b[36m\x1b[1m\n C: c0 / c1\n';
            // c graph
            for (let i = rows; i >= 0; i--) {
                out += '[ ';
                aKeys.forEach(node => {
                    let b = a[node].c * rows / largestc;
                    let y1 = i;
                    let y2 = (i - 1);
                    if (b <= y1 && b > y2) {
                        out += '_';
                    }
                    else if (b > y1) {
                        out += '│';
                    }
                    else {
                        out += ' ';
                    }
                });
                out += ' ]\n';
            }
            out += '\x1b[0m\n\x1b[40m\x1b[36m\x1b[1m\n N: n1 / n0\n';
            // n graph
            for (let i = rows; i >= 0; i--) {
                out += '[ ';
                aKeys.forEach(node => {
                    let b = a[node].n * rows / largestn;
                    let y1 = i;
                    let y2 = (i - 1);
                    if (b <= y1 && b > y2) {
                        out += '_';
                    }
                    else if (b > y1) {
                        out += '│';
                    }
                    else {
                        out += ' ';
                    }
                });
                out += ' ]\n';
            }
            out += '\x1b[0m\n\x1b[40m\x1b[31m\x1b[1m\n C: c1 / c0\n';
            // c inverted graph
            for (let i = rows; i >= 0; i--) {
                out += '[ ';
                aKeys.forEach(node => {
                    let b = rows / a[node].c / largestcInv;
                    let y1 = i;
                    let y2 = (i - 1);
                    if (b <= y1 && b > y2) {
                        out += '_';
                    }
                    else if (b > y1) {
                        out += '│';
                    }
                    else {
                        out += ' ';
                    }
                });
                out += ' ]\n';
            }
            out += '\x1b[0m\n\x1b[40m\x1b[31m\x1b[1m\n N: n0 / n1\n';
            // n inverted graph
            for (let i = rows; i >= 0; i--) {
                out += '[ ';
                aKeys.forEach(node => {
                    let b = rows / a[node].n / largestnInv;
                    let y1 = i;
                    let y2 = (i - 1);
                    if (b <= y1 && b > y2) {
                        out += '_';
                    }
                    else if (b > y1) {
                        out += '│';
                    }
                    else {
                        out += ' ';
                    }
                });
                out += ' ]\n';
            }
            out += '\x1b[0m';
            console.log(out);
        }
        else {
            console.log('Circuit has not been initialized...');
        }
    }

    private generateTestVectors(numInputs: number): string[] {
        let r: string[] = [];
        if (numInputs <= 10 && numInputs > 0) {
            let max = 2 ** numInputs;
            for (let i = 0; i < max; i++) {
                let s = i.toString(2);
                let lengthRemaining = numInputs - s.length;
                for (let j = 0; j < lengthRemaining; j++) {
                    s = '0' + s;
                }
                r.push(s);
            }
        }
        else if (numInputs > 10) {
            function genRandomTV(length: number): string {
                let s = ''
                for (let i = 0; i < length; i++) {
                    s += Math.floor(Math.random() * 2);
                }
                return s;
            }
            let tvSet: { [key: string]: boolean } = {};
            let count = 0;
            while (count < 1000) {
                let tv = genRandomTV(numInputs);
                if (!tvSet.hasOwnProperty(tv)) {
                    tvSet[tv] = true;
                    count++;
                }
            }
            r = Object.keys(tvSet);
        }
        return r;
    }


}