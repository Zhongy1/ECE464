import { LfsrDescriptor } from "./models";


export class Lfsr {
    public size: number;
    public seed: string;
    public misr: boolean;

    public startingInput: string;
    public currentOutput: string;


    constructor(public lfsrDescriptor: LfsrDescriptor) {
        this.size = lfsrDescriptor.size;
        this.seed = lfsrDescriptor.seed;
        this.misr = lfsrDescriptor.misr || false;

        this.startingInput = lfsrDescriptor.startingInput;
        this.currentOutput = this.startingInput;

        if (this.size != this.seed.length || this.size != this.startingInput.length) {
            throw "Lfsr size not fulfilled"
        }
    }

    public shift(input?: string): boolean {
        if (this.misr) {
            if (!input || input.length != this.size) return false;
            let lastVal = parseInt(this.currentOutput[this.currentOutput.length - 1]);
            let next = '';
            next += lastVal ^ parseInt(input[0]);
            for (let i = 1; i < this.size; i++) {
                if (this.seed[i] == '1') {
                    next += parseInt(this.currentOutput[i - 1]) ^ lastVal ^ parseInt(input[i]);
                }
                else {
                    next += parseInt(this.currentOutput[i - 1]) ^ parseInt(input[i]);
                }
            }
            this.currentOutput = next;
            return true;
        }
        else {
            let lastVal = parseInt(this.currentOutput[this.currentOutput.length - 1]);
            let next = '' + lastVal;
            for (let i = 1; i < this.size; i++) {
                if (this.seed[i] == '1') {
                    next += parseInt(this.currentOutput[i - 1]) ^ lastVal;
                }
                else {
                    next += this.currentOutput[i - 1];
                }
            }
            this.currentOutput = next;
            if (next == this.startingInput) return false;
            else return true;
        }
    }
}