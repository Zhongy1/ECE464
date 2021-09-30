import * as fs from 'fs';
import { Circuit } from '../src/circuit';
import { CLI } from "../src/cli";
import { Menu } from "../src/cli-models";
import { CircuitDescriptor } from '../src/models';
import { Parser } from '../src/parser';

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
                            let inp = (parseInt(cli.getValueFromCurrentMenu().match(/-{0,1}\d+/)![0]) >>> 0).toString(2);
                            let lengthRemaining = this.circuit!.numInputs - inp.length;
                            if (lengthRemaining > 0) {
                                for (let i = 0; i < lengthRemaining; i++) {
                                    inp = '0' + inp;
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
                            console.time('t1');
                            let fCvg = this.circuit!.getFaultCoverageWithInputByGroups(this.testVector!);
                            console.log(fCvg);
                            console.log(fCvg.length + ' faults');
                            console.timeEnd('t1');
                            console.log('Coverage individually:');
                            console.time('t2');
                            let fCvgS = this.circuit!.getFaultCoverageWithInputIndividually(this.testVector!);
                            console.log(fCvgS);
                            console.log(fCvgS.length + ' faults');
                            console.timeEnd('t2');
                            // fCvg?.forEach(fault => {
                            //     this.circuit?.clearFaults();
                            //     this.circuit?.insertFault(Parser.parseFault(fault));
                            //     this.circuit?.simulateWithInput(this.testVector!);
                            //     console.log('Fault: ' + fault);
                            //     console.dir(this.circuit?.outputs);
                            // });

                            return 'D3';
                        }
                    },
                    {
                        trigger: /^3$/,
                        transition: (cli: CLI) => {
                            // do E1
                            cli.printDebug('Doing E1');
                            // do E2
                            cli.printDebug('Doing E2');
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
            console.table(this.circuit.toTable());
        }
        else {
            console.log('Circuit has not been initialized...')
        }
    }
}