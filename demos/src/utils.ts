import { config } from 'dotenv'
import dotenvExpand from 'dotenv-expand'
import log from 'loglevel'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function loadEnv(): void {
    const myEnv = config()
    dotenvExpand.expand(myEnv)

    if (myEnv.error) {
        throw new Error('Failed to load the .env file.')
    }
}

export function sliceBytes(array: Uint8Array, start: number, length: number): Uint8Array {
    return array.slice(start, start + length)
}

export function getEnvVar(name: string): string {
    const value = process.env[name]
    if (!value) {
        throw new Error(`Please set ${name} in a .env file`)
    }
    return value
}

export function setVerbosity(verbosity: string) {
    if (verbosity === '' || verbosity === undefined) {
        log.setLevel(log.levels.SILENT)
    } else if (verbosity === 'trace') {
        log.setLevel(log.levels.TRACE)
    } else if (verbosity == 'debug') {
        log.setLevel(log.levels.DEBUG)
    } else if (verbosity === 'info') {
        log.setLevel(log.levels.INFO)
    } else if (verbosity === 'warn') {
        log.setLevel(log.levels.WARN)
    } else {
        throw new Error(`Invalid verbosity: ${verbosity}`)
    }
}
