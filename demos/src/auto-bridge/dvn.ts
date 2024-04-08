/* 

Build Subspace's own DVN

1. TODO: Listen to events: `PacketSent`, `` emitted from the WTsscLZ contract
2. 
*/

// Import ethers from the ethers package
import { ethers } from 'ethers'
import { config } from 'dotenv'
import { ZERO_ADDRESS } from '../utils'

// load env vars
// TODO: add '.env' file check if present
config()

// Example ABI array (simplified) and contract address - replace these with your actual ABI and contract address
const abi = [
    'event PacketSent(uint64 nonce, uint32 srcEid, address sender, uint32 dstEid, bytes32 receiver, bytes32 guid, bytes message)',
    // Include other functions and events as needed
]
const contractAddress = process.env.NOVA_ENDPOINT_V2 || ZERO_ADDRESS

// This assumes you are running a local Ethereum node on the default HTTP RPC port
// If you're connecting to a different network or using a WebSocket provider, adjust the provider accordingly
const provider = new ethers.providers.JsonRpcProvider(process.env.SRC_RPC_URL)

// Create a contract instance
const contract = new ethers.Contract(contractAddress, abi, provider)

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
    console.log(`Event data: ${event}`)
}

// Subscribe to the event
contract.on('PacketSent', onPacketSent)

console.log(
    `Listening for 'PacketSent' events from ${contractAddress.slice(0, 6)}...${contractAddress.slice(-4)} on Nova...`
)

process.on('SIGINT', () => {
    console.log('Terminating...')
    // Perform any cleanup here
    process.exit(0) // Exit cleanly
})
