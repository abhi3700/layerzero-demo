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
import { ZERO_ADDRESS } from '../utils'
import { ethers } from 'ethers'
import WTsscLzJson from '../../../artifacts/contracts/WTsscLz.sol/WTsscLz.json'
import { config } from 'dotenv'
import dotenvExpand from 'dotenv-expand'

// load env vars
const myEnv = config()
dotenvExpand.expand(myEnv)

// Check if the .env file is loaded or specific variables are set
if (myEnv.error) {
    throw new Error('Failed to load the .env file.')
}

async function main() {
    try {
        // set params mostly from local files like env, etc.
        const bridgeConfig: BridgeConfig = {
            networkNames: ['Nova', 'Sepolia'],
            chainRpcUrls: [process.env.SRC_RPC_URL || '', process.env.DST_RPC_URL || ''],
            endpointIds: [process.env.SRC_ENDPOINT_V2_ID || '', process.env.DST_ENDPOINT_V2_ID || ''],
            endpointAddresses: [
                process.env.SRC_ENDPOINT_V2 || ZERO_ADDRESS,
                process.env.DST_ENDPOINT_V2 || ZERO_ADDRESS,
            ],
            tokenAddresses: [process.env.SRC_CONTRACT || ZERO_ADDRESS, process.env.DST_CONTRACT || ZERO_ADDRESS],
            privateKey: process.env.PRIVATE_KEY || '',
            abi: WTsscLzJson.abi,
            bytecode: WTsscLzJson.bytecode,
        }

        // create an instance of token bridge for Sepolia to Mumbai testnets.
        const wTokenBridge = new WrappedTokenBridge(bridgeConfig, 'Subspace Wrapped TSSC', 'WTSSC')

        // Deploy tokens on either chains, if not deployed (depends on .env)
        // TODO: if freshly deployed, then need to set the address on .env so as to
        //      take the value from there in next run.
        await wTokenBridge.deployTokens()

        // Set peers, if not set
        await wTokenBridge.setPeers()

        // send tokens from Nova to Sepolia
        // TODO: add deposit feature inside
        await WrappedTokenBridge.sendTssc(
            wTokenBridge.tokens[0],
            wTokenBridge.signers[0],
            ethers.utils.parseUnits('1', 16), // 0.01 TSSC
            wTokenBridge.endpointIds[1],
            wTokenBridge.signers[1].address // sender (on srcChain) sending to itself (on dstChain)
        )

        // send tokens from Sepolia to Nova
        // await TokenBridge.sendTokens(
        //     wTokenBridge.tokens[1],
        //     wTokenBridge.signers[1],
        //     ethers.utils.parseUnits('1', 16), // 0.01 TSSC
        //     wTokenBridge.endpointIds[0],
        //     wTokenBridge.signers[0].address // sender (on srcChain) sending to itself (on dstChain)
        // )

        // NOTE:
        // - The sum of total supply of both the chains should 2M (as minted to each chain during deployment),
        // unless there is some delay in indexing info from LZ.
        // - Ideally one should put a sleep of 6 mins or more in between before displaying the accurate info.
        await wTokenBridge.getTotalSuppliesOf()

        /// Get balance of 3 addresses (1 EOA, 2 contracts)
        // await wTokenBridge.getBalancesOf(wTokenBridge.signers[0].address)
        // await wTokenBridge.getBalancesOf(wTokenBridge.tokens[0].address)
        // await wTokenBridge.getBalancesOf(wTokenBridge.tokens[1].address)
    } catch (error) {
        throw new Error(`Panicked 😱 with ${error}`)
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(`${error}`)
        process.exit(1)
    })
