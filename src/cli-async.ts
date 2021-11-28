import * as readline from 'readline-sync';
import { Menu } from "./cli-async-models";

export class CLIAsync {
    private menus: { [key: string]: Menu };
    private startId: string;
    private currMenuId: string;
    private menuIdStack: string[];
    private started: boolean;
    private quit: boolean;

    constructor(menuOptions: Menu[], startId?: string) {
        this.menus = {}
        for (let i = 0; i < menuOptions.length; i++) {
            this.menus[menuOptions[i].id] = {
                id: menuOptions[i].id,
                prompt: menuOptions[i].prompt,
                inValue: '',
                default: menuOptions[i].default || '',
                menuTransitions: menuOptions[i].menuTransitions,
                transitionIndex: -1
            }
        }
        this.startId = startId ? startId : 'start';

        this.currMenuId = this.startId;
        this.menuIdStack = [];
        this.started = false;
        this.quit = true;
    }

    public async run(): Promise<void> {
        if (this.started) return;
        await this.begin();
        while (!this.quit) {
            await this.transition();
        }
    }

    private async begin(): Promise<void> {
        if (this.started) return;
        this.started = true;
        this.quit = false;
        if (this.menus.hasOwnProperty(this.startId)) {
            await this.handlePrompt(this.menus[this.startId]);
        }
        else {
            this.terminate();
        }
    }

    private async transition(): Promise<void> {
        if (this.quit) return;
        if (!this.menus.hasOwnProperty(this.currMenuId)) return this.terminate();
        let currMenu = this.menus[this.currMenuId];
        let next = (currMenu.transitionIndex! > -1) ? currMenu.menuTransitions[currMenu.transitionIndex!].transition : 'q';
        let r;
        if (typeof next === 'function') {
            r = await next(this);
        }
        else {
            r = next;
        }

        if (r === 'q') {
            return this.terminate();
        }
        else if (r === 'b') {
            let previousId = this.menuIdStack.pop();
            this.currMenuId = (previousId) ? previousId : this.startId;
        }
        else if (r === 'reset') {
            this.currMenuId = (this.startId) ? this.startId : 'start';
            this.menuIdStack = [];
        }
        else {
            if (r !== this.currMenuId) {
                this.menuIdStack.push(this.currMenuId);
            }
            this.currMenuId = r;
        }

        if (this.menus.hasOwnProperty(this.currMenuId)) {
            await this.handlePrompt(this.menus[this.currMenuId]);
        }
        else {
            return this.terminate();
        }
    }

    private async handlePrompt(menu: Menu): Promise<void> {
        if (typeof menu.prompt === 'function') {
            var promptParts = (await menu.prompt(this)).match(/.*\n|.+$/g)!;
        }
        else {
            var promptParts = menu.prompt.match(/.*\n|.+$/g)!;
        }
        let prompt = '\x1b[1m\x1b[35m❯ [Prompt]\x1b[0m ';
        promptParts.forEach(part => {
            prompt += part;
            if (/\n/.test(part)) {
                prompt += '\x1b[1m\x1b[35m┃\x1b[0m ';
            }
        });
        prompt += '\n\x1b[1m\x1b[32m❯\x1b[0m ';
        let inpStr = readline.question(prompt);
        inpStr = inpStr.trim();
        menu.transitionIndex = -1;
        if (inpStr === '' && menu.default) {
            inpStr = menu.default;
        }
        if (inpStr === 'q') {
            menu.inValue = inpStr;
            this.terminate();
            return;
        }
        else if (inpStr === 'b') {
            let previousId = this.menuIdStack.pop();
            this.currMenuId = (previousId) ? previousId : this.startId;
            await this.handlePrompt(this.menus[this.currMenuId]);
            return;
        }
        // else if (menu.inRegex instanceof RegExp && menu.inRegex.test(inpStr) ||
        //     typeof menu.inRegex === 'function' && menu.inRegex(this).test(inpStr)) {
        //     menu.inValue = inpStr;
        //     for (let i = 0; i < menu.menuTransitions.length; i++) {
        //         let trigger = menu.menuTransitions[i].trigger;
        //         if (trigger instanceof RegExp && trigger.test(menu.inValue) ||
        //             typeof trigger === 'function' && trigger(this).test(menu.inValue)) {
        //             menu.transitionIndex = i;
        //         }
        //     }
        // }
        // else {
        //     this.printError('Illegal input. Try again.');
        //     this.handlePrompt(menu);
        //     return;
        // }
        menu.inValue = inpStr;
        for (let i = 0; i < menu.menuTransitions.length; i++) {
            let trigger = menu.menuTransitions[i].trigger;
            if (trigger instanceof RegExp && trigger.test(menu.inValue) ||
                typeof trigger === 'function' && (await trigger(this)).test(menu.inValue)) {
                menu.transitionIndex = i;
                return;
            }
        }
        this.printError('Illegal input. Try again.');
        this.handlePrompt(menu);
    }

    public getValueFromCurrentMenu(): string {
        if (this.menus.hasOwnProperty(this.currMenuId)) {
            return this.menus[this.currMenuId].inValue || '';
        }
        else {
            return '';
        }
    }

    public getValueFromMenu(id: string): string {
        if (this.menus.hasOwnProperty(id)) {
            return this.menus[id].inValue || '';
        }
        else {
            return '';
        }
    }

    public hasTerminated(): boolean {
        return this.quit;
    }

    public terminate(): void {
        this.quit = true;
        this.started = false;
        Object.keys(this.menus).forEach(id => {
            this.menus[id].inValue = '';
        });
        this.currMenuId = this.startId;
        this.menuIdStack = [];
    }

    public printInfo(str: string): void {
        let strParts = str.match(/.*\n|.+$/g)!;
        let s = '\x1b[1m\x1b[34m❯ [Info]\x1b[0m ';
        strParts.forEach(part => {
            s += part;
            if (/\n/.test(part)) {
                s += '\x1b[1m\x1b[34m┃\x1b[0m ';
            }
        });
        console.log(s);
    }

    public printError(str: string): void {
        let strParts = str.match(/.*\n|.+$/g)!;
        let s = '\x1b[1m\x1b[31m❯ [Error]\x1b[0m ';
        strParts.forEach(part => {
            s += part;
            if (/\n/.test(part)) {
                s += '\x1b[1m\x1b[31m┃\x1b[0m ';
            }
        });
        console.log(s);
    }

    public printDebug(str: string): void {
        let strParts = str.match(/.*\n|.+$/g)!;
        let s = '\x1b[1m\x1b[33m❯ [Debug]\x1b[0m ';
        strParts.forEach(part => {
            s += part;
            if (/\n/.test(part)) {
                s += '\x1b[1m\x1b[33m┃\x1b[0m ';
            }
        });
        console.log(s);
    }

}