import * as readline from 'readline-sync';
import { Menu } from "./cli-models";

export class CLI {
    private menus: { [key: string]: Menu };
    private startId: string;
    private currMenuId: string;
    private started;
    private quit;

    constructor(menuOptions: Menu[], startId?: string) {
        this.menus = {}
        for (let i = 0; i < menuOptions.length; i++) {
            this.menus[menuOptions[i].id] = menuOptions[i];
        }
        this.startId = startId ? startId : 'start';

        this.currMenuId = this.startId;
        this.started = false;
        this.quit = true;
    }

    public run(): void {
        if (this.started) return;
        this.begin();
        while (!this.quit) {
            this.transition();
        }
    }

    public begin(): void {
        if (this.started) return;
        this.started = true;
        this.quit = false;
        if (this.menus.hasOwnProperty(this.startId)) {
            this.handlePrompt(this.menus[this.startId]);
        }
        else {
            this.terminate();
        }
    }

    public transition(): void {
        if (this.quit) return;
        if (!this.menus.hasOwnProperty(this.currMenuId)) return this.terminate();
        let currMenu = this.menus[this.currMenuId];
        let next = (currMenu.transitionIndex > -1) ? currMenu.menuTransitions[currMenu.transitionIndex].transition : 'q';
        if (typeof next === 'string') {
            if (next === 'q') {
                return this.terminate();
            }
            else {
                this.currMenuId = next;
            }
        }
        else if (typeof next === 'function') {
            let r = next(this);
            if (r === 'q') {
                return this.terminate();
            }
            else {
                this.currMenuId = r;
            }
        }

        if (this.menus.hasOwnProperty(this.currMenuId)) {
            this.handlePrompt(this.menus[this.currMenuId]);
        }
        else {
            return this.terminate();
        }
    }

    private handlePrompt(menu: Menu): void {
        let promptParts = menu.prompt.match(/.*\n|.+$/g)!;
        let prompt = '\x1b[1m\x1b[35m❯ [Prompt]\x1b[0m ';
        promptParts.forEach(part => {
            prompt += part;
            if (/\n/.test(part)) {
                prompt += '\x1b[1m\x1b[35m┃\x1b[0m ';
            }
        });
        prompt += '\n\x1b[1m\x1b[32m❯\x1b[0m ';
        let inpStr = readline.question(prompt);
        menu.transitionIndex = -1;
        if (/^$/.test(inpStr) && menu.default) {
            inpStr = menu.default;
        }
        if (/^q$/.test(inpStr)) {
            menu.inValue = inpStr;
            this.terminate();
        }
        else if (menu.inRegex instanceof RegExp && menu.inRegex.test(inpStr) ||
            typeof menu.inRegex === 'function' && menu.inRegex(this).test(inpStr)) {
            menu.inValue = inpStr;
            for (let i = 0; i < menu.menuTransitions.length; i++) {
                let trigger = menu.menuTransitions[i].trigger;
                if (trigger instanceof RegExp && trigger.test(menu.inValue) ||
                    typeof trigger === 'function' && trigger(this).test(menu.inValue)) {
                    menu.transitionIndex = i;
                }
            }
        }
        else {
            this.printError('Illegal input. Try again.');
            this.handlePrompt(menu);
        }
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