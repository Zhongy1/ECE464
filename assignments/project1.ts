import * as fs from 'fs';
import { Circuit } from '../src/circuit';
import { CLI } from "../src/cli";
import { Menu } from "../src/cli-models";
import { CircuitDescriptor, FaultCoverageDetails, NodeInfo } from '../src/models';
import { Parser } from '../src/parser';
import { printTable, Table } from 'console-table-printer';

const p = new Table({
    columns: [
        { name: 'node', color: 'blue' },
        { name: 'type', color: 'blue' },
        { name: 'val', color: 'blue' },
        { name: 'logic', color: 'blue' },
        { name: 'debug', color: 'blue' },
    ],
    sort: (row1, row2) => {
        if (row1.type == 'Input' && row2.type != 'Input') {
            return -1;
        }
        if (row1.type == 'Internal' && row2.type == 'Input') {
            return 1;
        }
        if (row1.type == 'Internal' && row2.type == 'Output') {
            return -1;
        }
        if (row1.type == 'Output' && row2.type != 'Output') {
            return 1;
        }
        return 0;
    },
});

export class Project1 {
    public menuOptions!: Menu[];
    public cli: CLI;

    public circuit?: Circuit;
    public testVector?: string;

    constructor() {
        this.initMenuOptions();
        this.cli = new CLI(this.menuOptions, this.menuOptions[0].id);
    }

    private initMenuOptions() {
        this.menuOptions = [
            {
                id: 'A1',
                prompt: 'A1: Select bench file',
                inRegex: /^.+\.bench$/,
                inValue: '',
                default: 'hw1.bench',
                menuTransitions: [
                    {
                        trigger: /^.+\.bench$/,
                        transition: (cli: CLI) => {
                            let bench = this.getBenchFile(cli.getValueFromCurrentMenu());
                            if (bench) {
                                try {
                                    this.initCircuit(Parser.parseBench(bench));
                                }
                                catch {
                                    cli.printError('An error occured while parcing file. Terminating...');
                                    return 'q';
                                }
                                this.printCircuitInfo();
                                // console.dir(this.circuit?.faultEquivGroups);
                                return 'B1';
                            }
                            else {
                                cli.printError('Specified file does not exist or is empty');
                                return 'A1';
                            }
                        }
                    }
                ],
                transitionIndex: -1
            },
            {
                id: 'B1',
                prompt: 'B1: Enter test vector t',
                inRegex: /(^[01U]+$)|(^i -{0,1}\d+$)/,
                inValue: '',
                menuTransitions: [
                    {
                        trigger: /^[01U]+$/,
                        transition: (cli: CLI) => {
                            let inp = cli.getValueFromCurrentMenu();
                            let lengthRemaining = this.circuit!.numInputs - inp.length;
                            if (lengthRemaining > 0) {
                                for (let i = 0; i < lengthRemaining; i++) {
                                    inp += 'U';
                                }
                            }
                            else if (lengthRemaining < 0) {
                                inp = inp.substr(-lengthRemaining);
                            }
                            this.testVector = inp;
                            return 'B2';
                        }
                    },
                    {
                        trigger: /^i -{0,1}\d+$/,
                        transition: (cli: CLI) => {
                            let num = cli.getValueFromCurrentMenu().match(/-{0,1}\d+/)![0];
                            let inp = (parseInt(num) >>> 0).toString(2);
                            let lengthRemaining = this.circuit!.numInputs - inp.length;
                            if (lengthRemaining > 0) {
                                if (/-/.test(num)) {
                                    for (let i = 0; i < lengthRemaining; i++) {
                                        inp = '1' + inp;
                                    }
                                }
                                else {
                                    for (let i = 0; i < lengthRemaining; i++) {
                                        inp = '0' + inp;
                                    }
                                }
                            }
                            else if (lengthRemaining < 0) {
                                inp = inp.substr(-lengthRemaining);
                            }
                            this.testVector = inp;
                            return 'B2';
                        }
                    }
                ],
                transitionIndex: -1
            },
            {
                id: 'B2',
                prompt: 'B2: What would you like to do?\n  1: Single TV single fault\n  2: Single TV all faults\n  3: Best 5 TV for all faults',
                inRegex: /^[1-3]$/,
                inValue: '',
                menuTransitions: [
                    {
                        trigger: /^1$/,
                        transition: 'C1'
                    },
                    {
                        trigger: /^2$/,
                        transition: (cli: CLI) => {
                            // do D1
                            cli.printDebug('Doing D1');
                            console.log(this.circuit?.possibleFaults);
                            // do D2
                            cli.printDebug('Doing D2');
                            console.log('Coverage by groups:');
                            let details: FaultCoverageDetails = {
                                testVector: '',
                                allOutputs: {},
                                coveredFaults: []
                            }
                            let fCvg = this.circuit!.getFaultCoverageWithInputByGroups(this.testVector!, details);
                            // console.log('details all outputs length: ' + Object.keys(details.allOutputs!).length)
                            console.log(fCvg.length + ' faults covered');
                            let f = 'Fault list: \n';
                            f += this.circuit!.possibleFaults.join('\n') + '\n';
                            f += 'Total covered faults: ' + fCvg.length + '\n';
                            f += JSON.stringify(details, null, 2);
                            fs.writeFileSync('out.txt', f);

                            return 'D3';
                        }
                    },
                    {
                        trigger: /^3$/,
                        transition: (cli: CLI) => {
                            // do E1
                            cli.printDebug('Doing E1');
                            console.log('Total faults: ' + this.circuit?.possibleFaults.length);
                            // do E2
                            cli.printDebug('Doing E2');
                            console.time('t3');
                            let fCvg = this.circuit!.doAdditional4TVs(this.testVector!);
                            console.log(fCvg.length + ' faults');
                            console.timeEnd('t3');
                            return 'E3';
                        }
                    },

                ],
                transitionIndex: -1
            },
            {
                id: 'C1',
                prompt: 'C1: Enter a single fault f',
                inRegex: /^[\w]+'*-([\w]+'*-)*[01]$/,
                inValue: '',
                menuTransitions: [
                    {
                        trigger: /^[\w]+'*-([\w]+'*-)*[01]$/,
                        transition: (cli: CLI) => {
                            this.circuit?.clearFaults();
                            this.circuit?.insertFault(Parser.parseFault(cli.getValueFromCurrentMenu()));
                            this.circuit?.simulateWithInput(this.testVector!);
                            this.printCircuitInfo();
                            cli.printDebug('Fault has been detected: ' + this.circuit!.isFaultDetected());
                            fs.writeFileSync('out.txt', this.circuit!.toString());
                            return 'C3';
                        }
                    }
                ],
                transitionIndex: -1
            },
            {
                id: 'C3',
                prompt: 'C3: Operation Complete. What would you like to do?\n  Default: go back to B2\n  Another fault: (f): go to C1\n  Another tv (t): go to B1\n  Another bench (b): go to A1\n  quit (q): quit',
                inRegex: /^$|^[ftb]$/,
                inValue: '',
                menuTransitions: [
                    {
                        trigger: /^$/,
                        transition: 'B2'
                    },
                    {
                        trigger: /^f$/,
                        transition: 'C1'
                    },
                    {
                        trigger: /^t$/,
                        transition: 'B1'
                    },
                    {
                        trigger: /^b$/,
                        transition: 'A1'
                    }
                ],
                transitionIndex: -1
            },
            {
                id: 'D3',
                prompt: 'C3: Operation Complete. What would you like to do?\n  Default: go back to B2\n  Another tv (t): go to B1\n  Another bench (b): go to A1\n  quit (q): quit',
                inRegex: /^$|^[tb]$/,
                inValue: '',
                menuTransitions: [
                    {
                        trigger: /^$/,
                        transition: 'B2'
                    },
                    {
                        trigger: /^t$/,
                        transition: 'B1'
                    },
                    {
                        trigger: /^b$/,
                        transition: 'A1'
                    }
                ],
                transitionIndex: -1
            },
            {
                id: 'E3',
                prompt: 'E3: Operation Complete. What would you like to do?\n  Default: go back to B2\n  Another tv (t): go to B1\n  Another bench (b): go to A1\n  quit (q): quit',
                inRegex: /^$|^[tb]$/,
                inValue: '',
                menuTransitions: [
                    {
                        trigger: /^$/,
                        transition: 'B2'
                    },
                    {
                        trigger: /^t$/,
                        transition: 'B1'
                    },
                    {
                        trigger: /^b$/,
                        transition: 'A1'
                    }
                ],
                transitionIndex: -1
            }
        ];
    }

    public main(): void {
        this.cli.run();
    }

    public getBenchFile(fileName: string): string {
        if (!fs.existsSync(`./464benches/${fileName}`)) return '';
        return fs.readFileSync(`./464benches/${fileName}`, { encoding: 'utf8', flag: 'r' });
    }

    private initCircuit(circDesc: CircuitDescriptor): void {
        this.circuit = new Circuit(circDesc);
    }

    public printCircuitInfo() {
        if (this.circuit) {
            console.table(this.circuit!.toTable());
        }
        else {
            console.log('Circuit has not been initialized...')
        }
    }
}