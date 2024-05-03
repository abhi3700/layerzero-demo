/**
 * TODO: Add small doc
 * 0.01 wrapped TSSC Token successfully transferred from Nova to Sepolia.
 * Tx url:
 *
 * TODO: Verify this: "Takes approx. 5-6 mins to deliver the message to dst chain."
 *
 * TODO: Add custom DVNs
 */

import { BridgeConfig } from '../types'
import { WrappedTokenBridge } from './wtokenbridge'
import { ethers } from 'ethers'
import WTsscLzJson from '../../abi/WTsscLz.json'
import { loadEnv, getEnvVar } from '../utils'

loadEnv()

loadEnv()

async function init(): Promise<WrappedTokenBridge> {
    // Fetch environment variables
    const SRC_RPC_URL = getEnvVar('SRC_RPC_URL')
    const DST_RPC_URL = getEnvVar('DST_RPC_URL')
    const SRC_ENDPOINT_V2_ID = getEnvVar('SRC_ENDPOINT_V2_ID')
    const DST_ENDPOINT_V2_ID = getEnvVar('DST_ENDPOINT_V2_ID')
    const SRC_ENDPOINT_V2 = getEnvVar('SRC_ENDPOINT_V2')
    const DST_ENDPOINT_V2 = getEnvVar('DST_ENDPOINT_V2')
    const SRC_CONTRACT = getEnvVar('SRC_CONTRACT')
    const DST_CONTRACT = getEnvVar('DST_CONTRACT')
    const PRIVATE_KEY = getEnvVar('PRIVATE_KEY')

    // Set params from the fetched environment variables
    const bridgeConfig: BridgeConfig = {
        networkNames: ['Nova', 'Sepolia'],
        chainRpcUrls: [SRC_RPC_URL, DST_RPC_URL],
        endpointIds: [SRC_ENDPOINT_V2_ID, DST_ENDPOINT_V2_ID],
        endpointAddresses: [SRC_ENDPOINT_V2, DST_ENDPOINT_V2],
        tokenAddresses: [SRC_CONTRACT, DST_CONTRACT],
        privateKey: PRIVATE_KEY,
        abi: WTsscLzJson.abi,
        bytecode: WTsscLzJson.bytecode.object,
    }

    // create an instance of token bridge for Sepolia to Mumbai testnets.
    const wTokenBridge = new WrappedTokenBridge(bridgeConfig, 'Subspace Wrapped TSSC', 'WTSSC')

    // Deploy tokens on either chains, if not deployed (depends on .env)
    // NOTE: if freshly deployed, then need to set the address on .env so as to
    //      take the value from there in next run.
    await wTokenBridge.deployTokens()

    return wTokenBridge
}

// Task to send tokens from Nova to Sepolia
async function sendTokensFromNova(wTokenBridge: WrappedTokenBridge): Promise<void> {
    await WrappedTokenBridge.sendTssc(
        wTokenBridge.tokens[0],
        wTokenBridge.signers[0],
        ethers.utils.parseUnits('1', 16), // 0.01 wTSSC
        wTokenBridge.endpointIds[1],
        wTokenBridge.signers[1].address // sender (on srcChain) sending to itself (on dstChain)
    )
}

// Task to send tokens from Sepolia to Nova
async function sendTokensFromSepolia(wTokenBridge: WrappedTokenBridge): Promise<void> {
    await WrappedTokenBridge.sendTssc(
        wTokenBridge.tokens[1],
        wTokenBridge.signers[1],
        ethers.utils.parseUnits('1', 16), // 0.01 wTSSC
        wTokenBridge.endpointIds[0],
        wTokenBridge.signers[0].address // sender (on srcChain) sending to itself (on dstChain)
    )
}

async function runTask(taskName: string) {
    try {
        const wTokenBridge = await init()
        if (taskName === 'init') {
            // Set peers, if incorrectly/not set
            await wTokenBridge.setPeers()
        } else if (taskName === 'send01') {
            await sendTokensFromNova(wTokenBridge)
        } else if (taskName === 'send10') {
            await sendTokensFromSepolia(wTokenBridge)
        } else if (taskName === 'view') {
            console.log('=====================================================')
            // NOTE: Ideally one should put a sleep of 6 mins or more in between before displaying the accurate info.
            await wTokenBridge.getTotalSuppliesOf()
            console.log('=====================================================')
            /// Get balances
            await wTokenBridge.getBalancesOf(wTokenBridge.signers[0].address)
        } else {
            throw new Error('Task not recognized')
        }
    } catch (error) {
        console.error(`Error running task ${taskName}: ${error}`)
        process.exit(1)
    }
}

const taskName = process.argv[2]
runTask(taskName)
