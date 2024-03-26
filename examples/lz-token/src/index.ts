import { Contract, ethers, BigNumber } from 'ethers'
import { SendParamStruct, MessagingFeeStruct } from './typechain/contracts/MyToken'
import { Options } from '@layerzerolabs/lz-v2-utilities'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// load env var
import { config } from 'dotenv'
config()

import { assert } from 'chai'

const MyTokenJson = require('../../../artifacts/contracts/MyToken.sol/MyToken.json')
const abi = MyTokenJson.abi

const epA = process.env.SEPOLIA_ENDPOINT_V2_ID || ''
const epB = process.env.MUMBAI_ENDPOINT_V2_ID || ''

const tokenOnSepoliaAddress = process.env.MY_LZ_TOKEN_SEPOLIA || ZERO_ADDRESS
const tokenOnMumbaiAddress = process.env.MY_LZ_TOKEN_MUMBAI || ZERO_ADDRESS

const privateKey: string = process.env.PRIVATE_KEY || ''

/* 
    The setEnforcedOptions function allows the contract owner to specify mandatory execution options,
    making sure that the application behaves as expected when users interact with it.
    Docs: https://docs.layerzero.network/contracts/oft#setting-enforced-options

    Explore more for its benefits.
*/
async function setEnforcedParams(provider: ethers.providers.JsonRpcProvider, contract: Contract) {
    // Generate the EnforcedOptionParam[] array
    let enforcedOptions = [
        {
            eid: epB,
            msgType: 1,
            options: '0x00030100110100000000000000000000000000030d40',
        },
        {
            eid: epB,
            msgType: 2,
            options: '',
        },
        // ... add more destinations parameters as needed
    ]

    // Call the setEnforcedOptions function
    const tx = await contract.setEnforcedOptions(enforcedOptions)
    // Wait for the transaction to be mined
    await tx.wait()

    console.log('Enforced options set successfully! with tx hash: ', tx.hash)
}

async function sepolia_to_mumbai() {
    try {
        // ==== On Sepolia network
        const sepoliaProvider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL)
        const token = new ethers.Contract(tokenOnSepoliaAddress, abi, sepoliaProvider)
        const owner = new ethers.Wallet(privateKey, sepoliaProvider)

        // get balance of sender/owner
        // minted 1M tokens to owner during deployment
        const balOwner = await token.balanceOf(owner.address)
        console.log(
            'Balance on Sepolia network just before sending: ',
            ethers.utils.formatEther(BigInt(balOwner._hex).toString())
        )

        // OPTIONAL: Set enforced params
        // await setEnforcedParams(provider, token)

        const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString()
        const sendParams: SendParamStruct = {
            dstEid: epB,
            to: ethers.utils.hexZeroPad(tokenOnMumbaiAddress, 32),
            amountLD: BigNumber.from(String(1e18)), // 1 ether
            minAmountLD: BigNumber.from(String(1e18)), // 1 ether
            extraOptions: options,
            composeMsg: '0x',
            oftCmd: '0x',
        }

        // get quote before send
        const messagingFee: MessagingFeeStruct = await token.quoteSend(sendParams, false)
        console.log('quote: \n nativeFee: ', messagingFee.nativeFee, '\n lzFee: ', messagingFee.lzTokenFee)

        // send
        const sendTx = await token
            .connect(owner)
            .send(sendParams, messagingFee, owner.address, { value: messagingFee.nativeFee })
        await sendTx.wait()

        console.log('Tx hash for sending tokens on Sepolia: ', sendTx.hash)

        // ==== On Mumbai network
        const mumbaiProvider = new ethers.providers.JsonRpcProvider(process.env.MUMBAI_RPC_URL)
        const tokenMumbai = new ethers.Contract(tokenOnMumbaiAddress, abi, mumbaiProvider)

        // get balance of sender/owner
        const balMumbai = await tokenMumbai.balanceOf(owner.address)
        console.log(
            'Balance on Mumbai network just before receiving: ',
            ethers.utils.formatEther(BigInt(balMumbai._hex).toString())
        )
    } catch (error) {
        console.error('An error occurred:', error)
    }
}

async function main() {
    await sepolia_to_mumbai()
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
    })
