/**
 * 1 TSSC Token successfully transferred from Sepolia to Mumbai.
 * Tx url: https://testnet.layerzeroscan.com/tx/0x4add361c06fdda00faa7f329ff34d5e1ebc2544104a7cc444f955184dbb74216
 *
 * Takes approx. 5-6 mins.
 */

// TODO: Make it as OOP

import { Contract, ethers, BigNumber } from 'ethers'
import { SendParamStruct, MessagingFeeStruct } from './typechain/contracts/MyToken'
import { Options } from '@layerzerolabs/lz-v2-utilities'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// load env var
import { config } from 'dotenv'
config()

import { hexZeroPad } from 'ethers/lib/utils'

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

    TODO: Explore more for its benefits.
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

async function checkPeersSend(tokenAddresses: string[], contracts: Contract[], owners: ethers.Wallet[]) {
    const [tokenOnSepoliaAddress, tokenOnMumbaiAddress] = tokenAddresses
    const [tokenSepolia, tokenMumbai] = contracts
    const [ownerSepolia, ownerMumbai] = owners

    await checkAndSetPeer(tokenSepolia, epB, tokenOnMumbaiAddress, ownerSepolia, 'Sepolia')
    await checkAndSetPeer(tokenMumbai, epA, tokenOnSepoliaAddress, ownerMumbai, 'Mumbai')
}

async function checkAndSetPeer(
    tokenContract: Contract,
    endpointId: string,
    peerAddress: string,
    owner: ethers.Wallet,
    networkName: string
) {
    try {
        const paddedPeerAddress = hexZeroPad(peerAddress, 32)
        const isPeerSet = await tokenContract.isPeer(endpointId, paddedPeerAddress)
        if (!isPeerSet) {
            console.log(`Incorrect peer was set on ${networkName}`)
            const tx = await tokenContract.connect(owner).setPeer(endpointId, paddedPeerAddress)
            await tx.wait()
            console.log(`Now, correct peer set on ${networkName} via ${tx.hash}`)
        }
    } catch (error) {
        throw new Error(`Error setting peer on ${networkName} for address ${peerAddress}: ${error}`)
    }
}

async function sepolia_to_mumbai() {
    try {
        // ==== On Sepolia network
        const sepoliaProvider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL)
        const tokenSepolia = new ethers.Contract(tokenOnSepoliaAddress, abi, sepoliaProvider)
        const ownerSepolia = new ethers.Wallet(privateKey, sepoliaProvider)

        // ==== On Mumbai network
        const mumbaiProvider = new ethers.providers.JsonRpcProvider(process.env.MUMBAI_RPC_URL)
        const tokenMumbai = new ethers.Contract(tokenOnMumbaiAddress, abi, mumbaiProvider)
        const ownerMumbai = new ethers.Wallet(privateKey, mumbaiProvider)

        // check peers, if incorrect set them
        await checkPeersSend(
            [tokenOnSepoliaAddress, tokenOnMumbaiAddress],
            [tokenSepolia, tokenMumbai],
            [ownerSepolia, ownerMumbai]
        )

        console.log('Before sending tokens from Sepolia')
        // get balance of sender/owner
        // minted 1M tokens to owner during deployment
        const balOwner = await tokenSepolia.balanceOf(ownerSepolia.address)
        console.log("Owner's token balance: ", ethers.utils.formatEther(BigInt(balOwner._hex).toString()))

        const totSupplySepolia = await tokenSepolia.totalSupply()
        console.log('Token total supply: ', ethers.utils.formatEther(BigInt(totSupplySepolia._hex).toString()))

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
        const messagingFee: MessagingFeeStruct = await tokenSepolia.quoteSend(sendParams, false)
        // console.log('quote: \n nativeFee: ', messagingFee.nativeFee, '\n lzFee: ', messagingFee.lzTokenFee)

        // send
        const sendTx = await tokenSepolia
            .connect(ownerSepolia)
            .send(sendParams, messagingFee, ownerSepolia.address, { value: messagingFee.nativeFee })
        await sendTx.wait()

        console.log('Tx hash for sending tokens on Sepolia: ', sendTx.hash)

        // ==== On Mumbai network
        console.log('After tokens sent, but before receiving tokens on Mumbai')
        // get balance of sender/owner
        const balMumbai = await tokenMumbai.balanceOf(ownerMumbai.address)
        console.log("Owner's token balance: ", ethers.utils.formatEther(BigInt(balMumbai._hex).toString()))
        const totSupplyMumbai = await tokenMumbai.totalSupply()
        console.log('Token total supply: ', ethers.utils.formatEther(BigInt(totSupplyMumbai._hex).toString()))
    } catch (error) {
        console.error(`An error occurred in sepolia_to_mumbai: ${error}`)
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
