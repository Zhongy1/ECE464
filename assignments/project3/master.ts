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
    faultsCoveredLen: number,
    faultsNotCoveredLen: number,
    faultsThatEscapedLen: number,
    faultsNotEscapedLen: number
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
    private bistChar!: BistCharacteristics;

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
                            console.log();
                            cli.printInfo(
                                `Project topic: A study on fault escape rate of MISRs\n` +
                                `The goal of this program is to investigate the fault\n` +
                                `escape rate of MISRs as well as observe how good the\n` +
                                `the fault coverage is.`
                            );
                            console.log();
                            cli.printInfo(
                                `The program will do the number of trials you have selected\n` +
                                `and report to you the calculated averages of key datapoints.\n` +
                                `You can vary the number of TVs/cycles to observe results faster.\n` +
                                `You can also access individual trials in the "trials" folder,\n` +
                                `but you will have to do your own math`
                            );
                            console.log();
                            cli.printInfo(
                                `BIST Characteristics:\n` +
                                `- Randomized seed and starting input for LFSR\n` +
                                `- TVs are fed to the circuit as they're being generated\n` +
                                `- Randomized seed for MISR but starting input is all 0s`
                            );

                            return 'E';
                        }
                    }
                ]
            }
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
        this.io = new Server({
            pingTimeout: 60000
        });
        this.io.on('connection', socket => {
            this.numWorkers++;
            this.cli.printDebug(`Worker number ${this.numWorkers} connected`);
            socket.emit('circuit', this.selectedBench);
            socket.emit('set-trial', this.bistChar);
            this.workerTasks[socket.id] = {
                id: socket.id,
                assignedFault: null
            }
            if (this.ongoingTrial && this.faultsToDo.length > 0) {
                let f = this.faultsToDo.pop()!;
                this.workerTasks[socket.id].assignedFault = f;
                socket.emit('do-fault', f);
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
                        if (results.faultCovered) {
                            this.currTrialInfo.faultsNotEscaped.push(fault);
                        }
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
        let workerCount = (vCpuCount > 1) ? vCpuCount - 1 : 1;
        // let workerCount = 1;
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
        let numFaults = 0;
        for (let i = 0; i < this.trialLimit; i++) {
            this.currTrial++;
            this.bistChar = {
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
            this.generateNoFaultSignature(this.bistChar);
            this.faultsToDo = JSON.parse(JSON.stringify(this.circuit!.possibleFaults));
            this.currTrialInfo = {
                bench: this.selectedBench,
                bistChar: this.bistChar,
                totalTime: 0,
                numFaultsTested: this.faultsToDo.length,
                faultsCoveredLen: 0,
                faultsNotCoveredLen: 0,
                faultsThatEscapedLen: 0,
                faultsNotEscapedLen: 0,
                faultsCovered: [],
                faultsNotCovered: [],
                faultsThatEscaped: [],
                faultsNotEscaped: []
            }
            console.log('Trial ' + this.currTrial);
            // console.log(this.bistChar);
            numFaults = this.faultsToDo.length;
            this.cli.printInfo(
                `BIST Characteristics:\n` +
                `- LFSR size:        ${this.bistChar.lfsrSize}\n` +
                `- LFSR seed:        ${this.bistChar.lfsrSeed}\n` +
                `- LFSR start input: ${this.bistChar.lfsrStartingInput}\n` +
                `- MISR size:        ${this.bistChar.misrSize}\n` +
                `- MISR seed:        ${this.bistChar.misrSeed}\n` +
                `- MISR start input: All 0s\n` +
                `- Max cycles:       ${this.bistChar.maxCycles}\n` +
                `- Number of faults: ${numFaults}\n`
            );
            this.io.emit('set-trial', this.bistChar);
            await delay(1000);
            this.ongoingTrial = true;
            let startTime = Date.now();
            Object.keys(this.workerTasks).forEach(socketId => {
                if (this.faultsToDo.length > 0) {
                    let f = this.faultsToDo.pop()!;
                    this.workerTasks[socketId].assignedFault = f;
                    this.io.to(socketId).emit('do-fault', f);
                }
            });
            while (this.faultsToDo.length > 0 || this.workersBusy()) {
                console.log(`Faults remaining for trial ${this.currTrial}: ${this.faultsToDo.length}`);
                await delay(this.bistChar.oneRoundTimeEst * 10);
            }
            this.ongoingTrial = false;
            this.currTrialInfo.totalTime = Date.now() - startTime;
            this.currTrialInfo.faultsCoveredLen = this.currTrialInfo.faultsCovered.length;
            this.currTrialInfo.faultsNotCoveredLen = this.currTrialInfo.faultsNotCovered.length;
            this.currTrialInfo.faultsThatEscapedLen = this.currTrialInfo.faultsThatEscaped.length;
            this.currTrialInfo.faultsNotEscapedLen = this.currTrialInfo.faultsNotEscaped.length;
            fs.writeFileSync(path.join(process.cwd(), 'trials', `Trial${this.currTrial}.json`), JSON.stringify(this.currTrialInfo, null, 2));
            this.cli.printInfo(
                `Trial ${this.currTrial} Characteristics:\n` +
                `- Actual number of cycles:       ${this.currTrialInfo.bistChar.numTVsGenerated}\n` +
                `- Number of faults covered:      ${this.currTrialInfo.faultsCoveredLen}\n` +
                `- Number of faults not covered:  ${this.currTrialInfo.faultsNotCoveredLen}\n` +
                `- Number of faults that escaped: ${this.currTrialInfo.faultsThatEscapedLen}\n` +
                `- Number of faults not escaped:  ${this.currTrialInfo.faultsNotEscapedLen}\n` +
                `- Covered faults escaped rate:   ${(this.currTrialInfo.faultsThatEscapedLen / this.currTrialInfo.faultsCoveredLen * 100).toFixed(3)}%\n` +
                `- *All faults escaped rate:      ${((this.currTrialInfo.faultsThatEscapedLen + this.currTrialInfo.faultsNotCoveredLen) / numFaults * 100).toFixed(3)}%\n` +
                `* Given the BIST Characteristics, this is the rate that goes undetected`
            );
        }
        this.cli.printInfo('All trials completed');

        let numCyclesArr: number[] = [];
        let faultsCoveredLenArr: number[] = [];
        let faultsNotCoveredLenArr: number[] = [];
        let faultsThatEscapedLenArr: number[] = [];
        let faultsNotEscapedLenArr: number[] = [];
        for (let i = 0; i < this.trialLimit; i++) {
            let trialInfo: Trial = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'trials', `Trial${i + 1}.json`), { encoding: 'utf8', flag: 'r' }));
            numCyclesArr.push(trialInfo.bistChar.numTVsGenerated);
            faultsCoveredLenArr.push(trialInfo.faultsCoveredLen);
            faultsNotCoveredLenArr.push(trialInfo.faultsNotCoveredLen);
            faultsThatEscapedLenArr.push(trialInfo.faultsThatEscapedLen);
            faultsNotEscapedLenArr.push(trialInfo.faultsNotEscapedLen);
        }
        let numCyclesSums: number = 0;
        let faultsCoveredSums: number = 0;
        let faultsNotCoveredSums: number = 0;
        let faultsThatEscapedSums: number = 0;
        let faultsNotEscapedSums: number = 0;
        for (let i = 0; i < this.trialLimit; i++) {
            numCyclesSums += numCyclesArr[i];
            faultsCoveredSums += faultsCoveredLenArr[i];
            faultsNotCoveredSums += faultsNotCoveredLenArr[i];
            faultsThatEscapedSums += faultsThatEscapedLenArr[i];
            faultsNotEscapedSums += faultsNotEscapedLenArr[i];
        }
        this.cli.printInfo(
            `Trial Averages:\n` +
            `- Actual number of cycles:       ${(numCyclesSums / this.trialLimit).toFixed(3)}\n` +
            `- Number of faults covered:      ${(faultsCoveredSums / this.trialLimit).toFixed(3)}\n` +
            `- Number of faults not covered:  ${(faultsNotCoveredSums / this.trialLimit).toFixed(3)}\n` +
            `- Number of faults that escaped: ${(faultsThatEscapedSums / this.trialLimit).toFixed(3)}\n` +
            `- Number of faults not escaped:  ${(faultsNotEscapedSums / this.trialLimit).toFixed(3)}\n` +
            `- Covered faults escaped rate:   ${(faultsThatEscapedSums / this.trialLimit / (faultsCoveredSums / this.trialLimit) * 100).toFixed(3)}%\n` +
            `- *All faults escaped rate:      ${((faultsThatEscapedSums / this.trialLimit + faultsNotCoveredSums / this.trialLimit) / numFaults * 100).toFixed(3)}%\n` +
            `* Given the BIST Characteristics, this is the rate that goes undetected`
        );

        this.io.close();
    }
}