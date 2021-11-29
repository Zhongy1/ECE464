import * as fs from 'fs';
import * as path from 'path';
import { CLIAsync } from '../../src/cli-async';
import { Trial } from './master';

let trialLimit = 12;
let numFaults = 9316;
let cli: CLIAsync = new CLIAsync([], '');

let numCyclesArr: number[] = [];
let faultsCoveredLenArr: number[] = [];
let faultsNotCoveredLenArr: number[] = [];
let faultsThatEscapedLenArr: number[] = [];
let faultsNotEscapedLenArr: number[] = [];
for (let i = 0; i < trialLimit; i++) {
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
for (let i = 0; i < trialLimit; i++) {
    numCyclesSums += numCyclesArr[i];
    faultsCoveredSums += faultsCoveredLenArr[i];
    faultsNotCoveredSums += faultsNotCoveredLenArr[i];
    faultsThatEscapedSums += faultsThatEscapedLenArr[i];
    faultsNotEscapedSums += faultsNotEscapedLenArr[i];
}
cli.printInfo(
    `Trial Averages:\n` +
    `- Actual number of cycles:       ${(numCyclesSums / trialLimit).toFixed(3)}\n` +
    `- Number of faults covered:      ${(faultsCoveredSums / trialLimit).toFixed(3)}\n` +
    `- Number of faults not covered:  ${(faultsNotCoveredSums / trialLimit).toFixed(3)}\n` +
    `- Number of faults that escaped: ${(faultsThatEscapedSums / trialLimit).toFixed(3)}\n` +
    `- Number of faults not escaped:  ${(faultsNotEscapedSums / trialLimit).toFixed(3)}\n` +
    `- Covered faults escaped rate:   ${(faultsThatEscapedSums / trialLimit / (faultsCoveredSums / trialLimit) * 100).toFixed(3)}%\n` +
    `- *All faults escaped rate:      ${((faultsThatEscapedSums / trialLimit + faultsNotCoveredSums / trialLimit) / numFaults * 100).toFixed(3)}%\n` +
    `* Given the BIST Characteristics, this is the rate that goes undetected`
);