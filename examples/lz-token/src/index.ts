/**
 * 1 TSSC Token successfully transferred from Sepolia to Mumbai.
 * Tx url: https://testnet.layerzeroscan.com/tx/0x4add361c06fdda00faa7f329ff34d5e1ebc2544104a7cc444f955184dbb74216
 *
 * Takes approx. 5-6 mins to deliver the message to dst chain.
 */

import { TokenBridge, BridgeConfig, ZERO_ADDRESS } from './tokenbridge'
import { BigNumber, ethers } from 'ethers'
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
            tokenBridge.tokens[1].address
        )

        // send tokens from Mumbai to Sepolia
        await TokenBridge.sendTokens(
            tokenBridge.tokens[1],
            tokenBridge.signers[1],
            ethers.utils.parseUnits('1', 18), // 1 TSSC
            tokenBridge.endpointIds[0],
            tokenBridge.tokens[0].address
        )
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
