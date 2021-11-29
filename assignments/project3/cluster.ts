import * as os from 'os';
import { fork } from 'child_process';
import { Project3Worker } from "./worker";

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

    let vCpuCount = os.cpus().length;
    let workerCount = (vCpuCount > 1) ? vCpuCount : 1;
    console.log(`${vCpuCount} vCPUs detected; creating ${workerCount} remote workers`);
    for (let i = 0; i < workerCount; i++) {
        let worker = fork('assignments/project3/worker.ts', ['-t', target, '-p', `${port}`]);
    }
}

main();