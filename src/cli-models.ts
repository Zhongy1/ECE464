import { CLI } from "./cli";

export interface Menu {
    id: string,
    prompt: string,
    inRegex: RegExp | ((cli: CLI) => RegExp),
    inValue: string,
    default?: string,
    menuTransitions: MenuTransition[],
    transitionIndex: number
}

export interface MenuTransition {
    trigger: RegExp | ((cli: CLI) => RegExp),
    transition: string | ((cli: CLI) => string)
}