import * as fs from 'fs';
import * as path from 'path';
import * as ip from 'ip';
import * as os from 'os';
import { fork } from 'child_process';
import { Server } from 'socket.io';
import { Circuit } from '../../src/circuit';
import { CLIAsync } from "../../src/cli-async";
import { Menu } from "../../src/cli-async-models";
import { Parser } from '../../src/parser';
import { CircuitDescriptor } from '../../src/models';
import { Lfsr } from '../../src/lfsr';

export interface BistCharacteristics {
    lfsrSize: number,
    lfsrSeed: string,
    lfsrStartingInput: string,
    misrSize: number,            // Assume misr starting input is all 0's
    misrSeed: string,
    maxCycles: number,           // TV limit for the lfsr
    noFaultSignature: string,    // Signature for a faultless circuit
    oneRoundTimeEst: number,     // Time estimate for doing one round of TVs
    numTVsGenerated: number      // Number TVs generated given the maxCycles
}

export interface Trial {
    bench: string,
    bistChar: BistCharacteristics,
    totalTime: number,
    numFaultsTested: number,
    faultsCovered: string[],     // Covered by a TV
    faultsNotCovered: string[],  // Not covered by a TV, consider escaped?
    faultsThatEscaped: string[], // Covered but escaped
    faultsNotEscaped: string[]   // != signature implies covered
}

export interface RunDetails {
    faultCovered: boolean,
    escaped: boolean
}

export interface WorkerTaskDescriptor {
    id: string,
    assignedFault: string | null,

}

export class Project3 {
    public menuOptions!: Menu[];
    public cli: CLIAsync;

    private selectedBench!: string;
    public circuit?: Circuit;
    // private bistChar!: BistCharacteristics;

    public trialLimit!: number;
    public cycleLimit!: number;

    private io!: Server;
    private port: number;

    private ongoingTrial: boolean;
    private currTrial: number;
    private currTrialInfo!: Trial;
    private workerTasks: { [key: string]: WorkerTaskDescriptor }
    private numWorkers: number;
    private faultsToDo: string[];

    constructor() {
        this.initMenuOptions();
        this.cli = new CLIAsync(this.menuOptions, this.menuOptions[0].id);
        this.port = 5000;
        this.ongoingTrial = false;
        this.currTrial = 0;
        this.workerTasks = {}
        this.numWorkers = 0;
        this.faultsToDo = [];
    }

    private initMenuOptions() {
        this.menuOptions = [
            {
                id: 'A',
                prompt: 'Select bench file (Default: c3540.bench)',
                default: 'c3540.bench',
                menuTransitions: [
                    {
                        trigger: /^.+\.bench$/,
                        transition: async (cli: CLIAsync) => {
                            let bench = this.getBenchFile(cli.getValueFromCurrentMenu());
                            if (bench) {
                                try {
                                    this.initCircuit(Parser.parseBench(bench));
                                    this.selectedBench = cli.getValueFromCurrentMenu();
                                }
                                catch (err) {
                                    cli.printError('An error occured while parcing file. Terminating...');
                                    return 'q';
                                }
                                cli.printInfo('Circuit successfully initialized');
                                return 'B';
                            }
                            else {
                                cli.printError('Specified file does not exist or is empty');
                                return 'A';
                            }
                        }
                    }
                ]
            },
            {
                id: 'B',
                prompt: 'Input the number of trials (Default/Max: 30)',
                default: '30',
                menuTransitions: [
                    {
                        trigger: /^[0-9]+$/,
                        transition: async (cli: CLIAsync) => {
                            let trials = parseInt(cli.getValueFromCurrentMenu());
                            if (isNaN(trials) || trials > 30 || trials < 1) {
                                trials = 30;
                            }
                            cli.printInfo(`${trials} trials will be attempted\nTrial data will be stored in the "trials" folder`);
                            this.trialLimit = trials;
                            return 'C';
                        }
                    }
                ]
            },
            {
                id: 'C',
                prompt: 'LFSR\'s can potentially generate a lot of TVs\nChoose a limit for number of TVs (Default/Max: 10000)',
                default: '10000',
                menuTransitions: [
                    {
                        trigger: /^[0-9]+$/,
                        transition: async (cli: CLIAsync) => {
                            let cycles = parseInt(cli.getValueFromCurrentMenu());
                            if (isNaN(cycles) || cycles > 10000) {
                                cycles = 10000;
                            }
                            cli.printInfo(`Cycle/TV limit is set to ${cycles}`);
                            this.cycleLimit = cycles;

                            console.log();
                            cli.printInfo(
                                `Since data collection can take a long time,\n` +
                                `this program allows for local or remote worker\n` +
                                `processes to connect and share the workload\n`
                            );
                            this.initIO();
                            return 'D';
                        }
                    }
                ]
            },
            {
                id: 'D',
                prompt: 'Hit enter to begin accepting worker connections',
                menuTransitions: [
                    {
                        trigger: /^$/,
                        transition: async (cli: CLIAsync) => {
                            this.spawnWorkers(5000);

                            cli.printInfo(
                                `CLI control is now offline\n` +
                                `Local workers will spawn shortly\n` +
                                `Trials will begin in 15 seconds`
                            );

                            return 'E';
                        }
                    }
                ]
            }



            // {
            //     id: 'Ax',
            //     prompt: 'Select bench file',
            //     default: 'p2.bench',
            //     menuTransitions: [
            //         {
            //             trigger: /^.+\.bench$/,
            //             transition: async (cli: CLIAsync) => {
            //                 let bench = this.getBenchFile(cli.getValueFromCurrentMenu());
            //                 if (bench) {
            //                     try {
            //                         this.initCircuit(Parser.parseBench(bench));
            //                     }
            //                     catch (err) {
            //                         cli.printError('An error occured while parcing file. Terminating...');
            //                         return 'q';
            //                     }
            //                     // this.printCircuitInfo(false);
            //                     this.bistChar = {
            //                         lfsrSize: this.circuit!.numInputs,
            //                         lfsrSeed: this.genRandomTV(this.circuit!.numInputs),
            //                         lfsrStartingInput: this.genRandomTV(this.circuit!.numInputs),
            //                         misrSize: this.circuit!.numOutputs,
            //                         misrSeed: this.genRandomTV(this.circuit!.numOutputs),
            //                         maxCycles: 10000,
            //                         noFaultSignature: '',
            //                         oneRoundTimeEst: 0,
            //                         numTVsGenerated: 0
            //                     }
            //                     console.log(this.circuit!.possibleFaults.length)
            //                     this.generateNoFaultSignature(this.bistChar);
            //                     console.log(this.bistChar); 1
            //                     return 'A';
            //                 }
            //                 else {
            //                     cli.printError('Specified file does not exist or is empty');
            //                     return 'A';
            //                 }
            //             }
            //         }
            //     ]
            // },
            // {
            //     id: 'T',
            //     prompt: 'Enter to test',
            //     menuTransitions: [
            //         {
            //             trigger: /^$/,
            //             transition: async (cli: CLIAsync) => {
            //                 let lfsr = new Lfsr({
            //                     size: this.circuit!.numInputs,
            //                     seed: this.genRandomTV(this.circuit!.numInputs),
            //                     startingInput: this.genRandomTV(this.circuit!.numInputs)
            //                 });

            //                 let misr: Lfsr | null = null;

            //                 console.time('T1');
            //                 while (true) {
            //                     this.circuit!.simulateWithInput(lfsr.currentOutput);
            //                     if (misr) {
            //                         misr.shift(this.circuit!.getOutputStr(true));
            //                     }
            //                     else {
            //                         misr = new Lfsr({
            //                             size: this.circuit!.numOutputs,
            //                             seed: this.genRandomTV(this.circuit!.numOutputs),
            //                             startingInput: this.circuit!.getOutputStr(true)
            //                         });
            //                     }
            //                     if (!lfsr.shift()) {
            //                         console.log(misr.currentOutput)
            //                         break;
            //                     }
            //                 }
            //                 console.timeEnd('T1');
            //                 return 'A';
            //             }
            //         }
            //     ]
            // },
        ]
    }

    public async main() {
        await this.cli.run();
        setTimeout(() => {
            this.doTrials();
        }, 15000);
    }

    private initIO(): void {
        if (this.io) return;
        this.io = new Server();
        this.io.on('connection', socket => {
            this.numWorkers++;
            this.cli.printDebug(`Worker number ${this.numWorkers} connected`);
            socket.emit('circuit', this.selectedBench);
            this.workerTasks[socket.id] = {
                id: socket.id,
                assignedFault: null
            }
            if (this.ongoingTrial && this.faultsToDo) {

            }

            socket.on('disconnect', () => {
                if (this.workerTasks[socket.id].assignedFault) {
                    this.faultsToDo.push(this.workerTasks[socket.id].assignedFault!);
                }
                delete this.workerTasks[socket.id];
                this.numWorkers--;
            });

            socket.on('fault-results', (results: RunDetails) => {
                let fault = this.workerTasks[socket.id].assignedFault;
                this.workerTasks[socket.id].assignedFault = null;
                if (fault) {
                    if (results.faultCovered) {
                        this.currTrialInfo.faultsCovered.push(fault);
                    }
                    else {
                        this.currTrialInfo.faultsNotCovered.push(fault);
                    }
                    if (results.escaped) {
                        if (results.faultCovered) {
                            this.currTrialInfo.faultsThatEscaped.push(fault);
                        }
                    }
                    else {
                        this.currTrialInfo.faultsNotEscaped.push(fault);
                    }
                }
                if (this.ongoingTrial && this.faultsToDo.length > 0) {
                    let f = this.faultsToDo.pop()!;
                    this.workerTasks[socket.id].assignedFault = f;
                    socket.emit('do-fault', f);
                }
            });
        });
        this.io.listen(this.port);
        this.cli.printInfo(`Socket.io server started:\n  This machine's IP: ${ip.address()}\n  Port: ${this.port}`);
    }

    private getBenchFile(fileName: string): string {
        if (!fs.existsSync(`./464benches/${fileName}`)) return '';
        return fs.readFileSync(`./464benches/${fileName}`, { encoding: 'utf8', flag: 'r' });
    }

    private initCircuit(circDesc: CircuitDescriptor): void {
        this.circuit = new Circuit(circDesc);
    }

    private spawnWorkers(port: number): void {
        let vCpuCount = os.cpus().length;
        // let workerCount = (vCpuCount > 1) ? vCpuCount - 1 : 1;
        let workerCount = 1;
        this.cli.printInfo(`${vCpuCount} vCPUs detected; creating ${workerCount} local workers`);
        for (let i = 0; i < workerCount; i++) {
            let worker = fork('assignments/project3/worker.ts', ['-p', `${port}`]);
        }
    }

    private genRandomTV(length: number): string {
        let s = ''
        for (let i = 0; i < length; i++) {
            s += Math.floor(Math.random() * 2);
        }
        return s;
    }

    private generateNoFaultSignature(bistChar: BistCharacteristics): void {
        let lfsr = new Lfsr({
            size: bistChar.lfsrSize,
            seed: bistChar.lfsrSeed,
            startingInput: bistChar.lfsrStartingInput
        });

        let misr: Lfsr | null = null;

        let startTime = Date.now();
        let cycle = 0;
        while (cycle < bistChar.maxCycles) {
            this.circuit!.simulateWithInput(lfsr.currentOutput);
            if (misr) {
                misr.shift(this.circuit!.getOutputStr(true));
            }
            else {
                misr = new Lfsr({
                    size: bistChar.misrSize,
                    seed: bistChar.misrSeed,
                    startingInput: this.circuit!.getOutputStr(true)
                });
            }
            cycle++;
            if (!lfsr.shift()) {
                break;
            }
        }
        bistChar.noFaultSignature = misr!.currentOutput;
        bistChar.numTVsGenerated = cycle;
        bistChar.oneRoundTimeEst = Date.now() - startTime;
    }

    private workersBusy(): boolean {
        let ids = Object.keys(this.workerTasks);
        for (let i = 0; i < ids.length; i++) {
            if (this.workerTasks[ids[i]].assignedFault) {
                return true;
            }
        }
        return false;
    }

    private async doTrials(): Promise<void> {
        function delay(time: number) {
            return new Promise(resolve => { setTimeout(() => resolve(''), time); });
        }
        for (let i = 0; i < this.trialLimit; i++) {
            this.ongoingTrial = true;
            this.currTrial++;
            let bistChar: BistCharacteristics = {
                lfsrSize: this.circuit!.numInputs,
                lfsrSeed: this.genRandomTV(this.circuit!.numInputs),
                lfsrStartingInput: this.genRandomTV(this.circuit!.numInputs),
                misrSize: this.circuit!.numOutputs,
                misrSeed: this.genRandomTV(this.circuit!.numOutputs),
                maxCycles: this.cycleLimit,
                noFaultSignature: '',
                oneRoundTimeEst: 0,
                numTVsGenerated: 0
            }
            this.generateNoFaultSignature(bistChar);
            console.log('Trial ' + this.currTrial);
            console.log(bistChar);
            this.faultsToDo = JSON.parse(JSON.stringify(this.circuit!.possibleFaults));
            this.currTrialInfo = {
                bench: this.selectedBench,
                bistChar: bistChar,
                totalTime: 0,
                numFaultsTested: this.faultsToDo.length,
                faultsCovered: [],
                faultsNotCovered: [],
                faultsThatEscaped: [],
                faultsNotEscaped: []
            }
            this.io.emit('set-trial', bistChar);
            let startTime = Date.now();
            Object.keys(this.workerTasks).forEach(socketId => {
                if (this.faultsToDo.length > 0) {
                    let f = this.faultsToDo.pop()!;
                    this.workerTasks[socketId].assignedFault = f;
                    this.io.to(socketId).emit('do-fault', f);
                }
            });
            while (this.faultsToDo.length > 0 || this.workersBusy()) {
                // console.log(this.faultsToDo.length);
                await delay(bistChar.oneRoundTimeEst);
            }
            this.ongoingTrial = false;
            this.currTrialInfo.totalTime = Date.now() - startTime;
            fs.writeFileSync(path.join(process.cwd(), 'trials', `Trial${this.currTrial}.json`), JSON.stringify(this.currTrialInfo, null, 2));
        }
        this.cli.printInfo('All trials completed');

        this.io.close();
    }
}