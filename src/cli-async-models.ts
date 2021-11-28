import { CLIAsync } from "./cli-async";

export interface Menu {
    id: string,
    prompt: string | ((cli: CLIAsync) => Promise<string>),
    // inRegex: RegExp | ((cli: CLIAsync) => RegExp),
    inValue?: string,
    default?: string,
    menuTransitions: MenuTransition[],
    transitionIndex?: number
}

export interface MenuTransition {
    trigger: RegExp | ((cli: CLIAsync) => Promise<RegExp>),
    transition: string | ((cli: CLIAsync) => Promise<string>)
}