import * as fs from 'fs';
import * as path from 'path';
import { io, Socket } from 'socket.io-client';
import { Circuit } from '../../src/circuit';
import { Lfsr } from '../../src/lfsr';
import { CircuitDescriptor } from '../../src/models';
import { Parser } from '../../src/parser';
import { BistCharacteristics, RunDetails } from './master';

export class Project3Worker {

    public socket: Socket;

    public circuit!: Circuit;

    private bistChar!: BistCharacteristics;
    private assignedFault!: string;

    constructor(private target: string) {
        this.socket = io('ws://' + target);
        this.initListeners();
    }

    private initListeners(): void {
        this.socket.on('connect', () => {
            console.log('[Worker] Connection successful');
        });
        this.socket.on('error', (err) => {
            console.log('[Worker] Error connecting');
        });
        this.socket.on('disconnect', () => {
            console.log('[Worker] Closing worker...')
            this.socket.close();
        });

        this.socket.on('circuit', (benchFile: string) => {
            let bench = this.getBenchFile(benchFile);
            this.initCircuit(Parser.parseBench(bench));
        });
        this.socket.on('set-trial', (bistChar: BistCharacteristics) => {
            this.bistChar = bistChar;
        });
        this.socket.on('do-fault', (fault: string) => {
            this.assignedFault = fault;
            this.circuit!.clearFaults();
            this.circuit!.insertFault(Parser.parseFault(fault));
            let results = this.testFault();
            this.socket.emit('fault-results', results);
        });
    }

    private getBenchFile(fileName: string): string {
        if (!fs.existsSync(path.join(process.cwd(), '464benches', fileName))) return '';
        return fs.readFileSync(path.join(process.cwd(), '464benches', fileName), { encoding: 'utf8', flag: 'r' });
    }

    private initCircuit(circDesc: CircuitDescriptor): void {
        this.circuit = new Circuit(circDesc);
    }

    private testFault(): RunDetails {
        let results: RunDetails = {
            faultCovered: false,
            escaped: false
        }

        let lfsr = new Lfsr({
            size: this.bistChar.lfsrSize,
            seed: this.bistChar.lfsrSeed,
            startingInput: this.bistChar.lfsrStartingInput
        });

        let misr: Lfsr | null = null;

        let cycle = 0;
        while (cycle < this.bistChar.maxCycles) {
            this.circuit!.simulateWithInput(lfsr.currentOutput);
            // console.log('[w] ' + this.circuit!.getOutputStr(true))
            if (!results.faultCovered && this.circuit!.isFaultDetected()) {
                results.faultCovered = true;
            }
            if (misr) {
                misr.shift(this.circuit!.getOutputStr(true));
            }
            else {
                misr = new Lfsr({
                    size: this.bistChar.misrSize,
                    seed: this.bistChar.misrSeed,
                    startingInput: this.circuit!.getOutputStr(true),
                    misr: true
                });
            }

            cycle++;
            if (!lfsr.shift()) {
                break;
            }
        }
        if (misr!.currentOutput === this.bistChar.noFaultSignature) {
            results.escaped = true;
        }
        return results;
    }
}

function main() {
    let target = 'localhost';
    let port = 3000;
    if (process.argv.includes('-t')) {
        target = process.argv[process.argv.indexOf('-t') + 1];
    }
    if (process.argv.includes('-p')) {
        let tempPort: number = Number(process.argv[process.argv.indexOf('-p') + 1]);
        if (!isNaN(tempPort)) {
            port = tempPort;
        }
    }

    let worker = new Project3Worker(target + ':' + port);
}

main();
