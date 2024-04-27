import { config } from 'dotenv'
import dotenvExpand from 'dotenv-expand'

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
