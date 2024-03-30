/**
 * 1 TSSC Token successfully transferred from Sepolia to Mumbai.
 * Tx url: https://testnet.layerzeroscan.com/tx/0xa3811d3bd8f80af4d40f3cd488349c80a264ac49d8bd290dc1b028575d5234eb
 *
 * Takes approx. 5-6 mins to deliver the message to dst chain.
 */

import { TokenBridge, BridgeConfig, ZERO_ADDRESS } from './tokenbridge'
import { ethers } from 'ethers'
import { config } from 'dotenv'

// load env vars
config()

async function main() {
    try {
        // fetch ABI, Bytecode
        const MyTokenJson = require('../../../artifacts/contracts/MyToken.sol/MyToken.json')

        // set params mostly from local files like env, etc.
        const bridgeConfig: BridgeConfig = {
            networkNames: ['Sepolia', 'Mumbai'],
            chainRpcUrls: [process.env.SRC_RPC_URL || '', process.env.DST_RPC_URL || ''],
            endpointIds: [process.env.SRC_ENDPOINT_V2_ID || '', process.env.DST_ENDPOINT_V2_ID || ''],
            endpointAddresses: [
                process.env.SRC_ENDPOINT_V2 || ZERO_ADDRESS,
                process.env.DST_ENDPOINT_V2 || ZERO_ADDRESS,
            ],
            tokenAddresses: [process.env.SRC_CONTRACT || ZERO_ADDRESS, process.env.DST_CONTRACT || ZERO_ADDRESS],
            privateKey: process.env.PRIVATE_KEY || '',
            abi: MyTokenJson.abi,
            bytecode: MyTokenJson.bytecode,
        }

        // create an instance of token bridge for Sepolia to Mumbai testnets.
        const tokenBridge = new TokenBridge(bridgeConfig, 'Subspace Token', 'TSSC')

        // Deploy tokens on either chains, if not deployed (depends on .env)
        // TODO: if freshly deployed, then need to set the address on .env so as to
        //      take the value from there in next run.
        await tokenBridge.deployTokens()

        // Set peers, if not set
        await tokenBridge.setPeers()

        // send tokens from Sepolia to Mumbai
        await TokenBridge.sendTokens(
            tokenBridge.tokens[0],
            tokenBridge.signers[0],
            ethers.utils.parseUnits('1', 18), // 1 TSSC
            tokenBridge.endpointIds[1],
            tokenBridge.signers[1].address // sender (on srcChain) sending to itself (on dstChain)
        )

        // send tokens from Mumbai to Sepolia
        await TokenBridge.sendTokens(
            tokenBridge.tokens[1],
            tokenBridge.signers[1],
            ethers.utils.parseUnits('1', 18), // 1 TSSC
            tokenBridge.endpointIds[0],
            tokenBridge.signers[0].address // sender (on srcChain) sending to itself (on dstChain)
        )

        // NOTE:
        // - The sum of total supply of both the chains should 2M (as minted to each chain during deployment),
        // unless there is some delay in indexing info from LZ.
        // - Ideally one should put a sleep of 6 mins or more in between before displaying the accurate info.
        await tokenBridge.getTotalSuppliesOf()

        /// Get balance of 3 addresses (1 EOA, 2 contracts)
        await tokenBridge.getBalancesOf(tokenBridge.signers[0].address)
        await tokenBridge.getBalancesOf(tokenBridge.tokens[0].address)
        await tokenBridge.getBalancesOf(tokenBridge.tokens[1].address)
    } catch (error) {
        throw new Error(`Panic with ${error}`)
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(`${error}`)
        process.exit(1)
    })
