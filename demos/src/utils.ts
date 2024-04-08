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
