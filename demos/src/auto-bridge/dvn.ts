/* 

Build Subspace's own DVN

1. TODO: Listen to events: `PacketSent`, `` emitted from the WTsscLZ contract
2. 

TODO: Add concurrency to verify, execute txs when they're ready
*/

// Import ethers from the ethers package
import { ethers } from 'ethers'
import { loadEnv } from '../utils'

loadEnv()

// Example ABI array (simplified) and contract address - replace these with your actual ABI and contract address
// const counterAbi = ['event NumberSet(address indexed caller, uint256 newNumber)']
const wTsscLzAbi = [
    'event Transfer(address indexed from, address indexed to, uint256 amount)',
    'event OFTSent(bytes32 indexed guid, uint32 dstEid, address indexed fromAddress, uint256 amountSentLD, uint256 amountReceivedLD)',
    'event OFTReceived(bytes32 indexed guid, uint32 srcEid, address indexed toAddress, uint256 amountReceivedLD)',
]
const sendUln302Abi = [
    'event DVNFeePaid(address[] requiredDVNs, address[] optionalDVNs, uint256[] fees)',
    'event ExecutorFeePaid(address executor, uint256 fee)',
]
const endpointV2Abi = [
    'event PacketSent(uint64 nonce, uint32 srcEid, address sender, uint32 dstEid, bytes32 receiver, bytes32 guid, bytes message)',
    'event PacketDelivered(Origin origin, address receiver)',
]

// Listener function for the NumberSet event of 'Counter' contract
// const onNumberSet = (caller: string, newNumber: ethers.BigNumber, event: ethers.Event) => {
//     console.log(`Number Set!`)
//     console.log(`Caller: ${caller}`)
//     console.log(`Message: ${newNumber.toString()}`)
//     // Process the event as needed
//     // console.log(`Event data: ${event.transactionHash}`)
//     console.log(`Event data: ${JSON.stringify(event, null, 2)}`)
// }

const onTransferSrc = () => {
    console.log(`Transfer! Source`)
}

const onExecutorFeePaid = () => {
    console.log(`Executor Fee Paid!`)
}

const onDVNFeePaid = () => {
    console.log(`DVN Fee Paid!`)
}

// Listener function for the PacketSent event
const onPacketSent = (
    nonce: ethers.BigNumber,
    srcEid: number,
    sender: string,
    dstEid: number,
    receiver: string,
    guid: string,
    message: Uint8Array,
    event: ethers.Event
) => {
    console.log(`Packet Sent!`)
    console.log(`Nonce: ${nonce.toString()}`)
    console.log(`Source EID: ${srcEid}`)
    console.log(`Sender: ${sender}`)
    console.log(`Destination EID: ${dstEid}`)
    console.log(`Receiver: ${receiver}`)
    console.log(`GUID: ${guid}`)
    console.log(`Message: ${ethers.utils.toUtf8String(message)}`)
    // Process the event as needed
    console.log(`Event data: ${JSON.stringify(event, null, 2)}`)

    // TODO: DVN should verify the message

    // TODO: Executor should execute the message
}

const onOFTSent = () => {
    console.log(`OFT Sent!`)
}

const onTransferDst = () => {
    console.log(`Transfer! Destination`)
}

const onOFTReceived = () => {
    console.log(`OFT Received!`)
}

const onPacketDelivered = () => {
    console.log(`Packet Delivered!`)
}

async function main() {
    try {
        // const counterAddress = process.env.COUNTER || ""
        const wTsscLzAddressNova = process.env.WTSSCLZ_NOVA || ''
        const sendUln302AddressNova = process.env.NOVA_SENDULN302 || ''
        const endpointV2AddressNova = process.env.NOVA_ENDPOINT_V2 || ''

        const wTsscLzAddressSepolia = process.env.WTSSCLZ_SEPOLIA || ''
        const endpointV2AddressSepolia = process.env.SEPOLIA_ENDPOINT_V2 || ''

        // providers
        const nova_provider = new ethers.providers.JsonRpcProvider(process.env.NOVA_RPC_URL)
        const sepolia_provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL)

        // contract instances
        // const counterContract = new ethers.Contract(counterAddress, abi, nova_provider)
        const wTsscLzNova = new ethers.Contract(wTsscLzAddressNova, wTsscLzAbi, nova_provider)
        const sendUln302Nova = new ethers.Contract(sendUln302AddressNova, sendUln302Abi, nova_provider)
        const endpointV2Nova = new ethers.Contract(endpointV2AddressNova, endpointV2Abi, nova_provider)
        const wTsscLzSepolia = new ethers.Contract(wTsscLzAddressSepolia, wTsscLzAbi, sepolia_provider)
        const endpointV2Sepolia = new ethers.Contract(endpointV2AddressSepolia, endpointV2Abi, sepolia_provider)

        // Subscribe to the event
        // counterContract.on('NumberSet', onNumberSet)
        wTsscLzNova.on('Transfer', onTransferSrc)
        sendUln302Nova.on('ExecutorFeePaid', onExecutorFeePaid)
        sendUln302Nova.on('DVNFeePaid', onDVNFeePaid)
        endpointV2Nova.on('PacketSent', onPacketSent)
        wTsscLzNova.on('OFTSent', onOFTSent)

        wTsscLzSepolia.on('Transfer', onTransferDst)
        wTsscLzSepolia.on('OFTReceived', onOFTReceived)
        endpointV2Sepolia.on('PacketDelivered', onPacketDelivered)

        if (
            wTsscLzAddressNova === '' ||
            sendUln302AddressNova === '' ||
            endpointV2AddressNova === '' ||
            wTsscLzAddressSepolia === '' ||
            endpointV2AddressSepolia === ''
        ) {
            throw Error('All contracts must be non-zero')
        }

        // Listen for events on the contract
        console.log(
            `Listening for emitted events from ${wTsscLzAddressNova.slice(0, 6)}...${wTsscLzAddressNova.slice(-4)} on Nova...`
        )
    } catch (error) {
        throw new Error(`Panicked 😱 with ${error}`)
    }
}

main()
    .then(() => {
        process.on('SIGINT', () => {
            console.log('Terminating...')
            // Perform any cleanup here
            process.exit(0) // Exit cleanly
        })
    })
    .catch((error) => {
        console.error(`${error}`)
        process.exit(1)
    })
