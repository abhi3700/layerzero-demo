/* 

This script is for Subspace's native DVN, Exectuor layer.

All the txs take place on Dst chain (eg. Sepolia in this case).

TODO: Add concurrency to verify, execute txs for scalability
*/

// Import ethers from the ethers package
import { BigNumber, ethers } from 'ethers'
import { loadEnv, sliceBytes, deserializePacket, Packet } from '../utils'

loadEnv()

// Contracts declaration
let endpointV2Dst: ethers.Contract, wTsscLzDst: ethers.Contract

// Signers
// NOTE: kept same for both src & dst chains
let signerSrc: ethers.Wallet, signerDst: ethers.Wallet

// Provider
let providerDst: ethers.providers.Provider

// Endpoint IDs
let srcEid: number, dstEid: number

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

const receiverMsgLibAbi = [
    'function verify(bytes calldata _packetHeader, bytes32 _payloadHash, uint64 _confirmations) external',
    'function commitVerification(bytes calldata _packetHeader, bytes32 _payloadHash) external',
    // 'function getUlnConfig(address _oapp, uint32 _remoteEid) public view returns (UlnConfig memory rtnConfig)',
    'function getUlnConfig(address _oapp, uint32 _remoteEid) view returns (tuple(uint confirmations, uint requiredDVNCount, uint optionalDVNCount, uint optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs))',
]

const endpointV2Abi = [
    'event PacketSent(bytes encodedPayload, bytes options, address sendLibrary)',
    'event PacketDelivered(Origin origin, address receiver)',
    // NOTE: In the LZ docs, it can be both `getReceiveLibrary` and `defaultReceiveLibrary`
    // 'function getReceiveLibrary(address _receiver, uint32 _eid) external view returns (address lib, bool isDefault)',
    'function defaultReceiveLibrary(uint32 _eid) external view returns (address)',
]

const onTransferSrc = () => {
    console.log(`Transfer! Source`)
}

const onExecutorFeePaid = () => {
    console.log(`Executor Fee Paid!`)
}

const onDVNFeePaid = () => {
    console.log(`DVN Fee Paid!`)
}

interface UlnConfig {
    confirmations: BigNumber // we store the length of required DVNs and optional DVNs instead of using DVN.length directly to save gas
    requiredDVNCount: BigNumber // 0 indicate DEFAULT, NIL_DVN_COUNT indicate NONE (to override the value of default)
    optionalDVNCount: BigNumber // 0 indicate DEFAULT, NIL_DVN_COUNT indicate NONE (to override the value of default)
    optionalDVNThreshold: BigNumber // (0, optionalDVNCount]
    requiredDVNs: string[] // no duplicates. sorted an an ascending order. allowed overlap with optionalDVNs
    optionalDVNs: string[] // no duplicates. sorted an an ascending order. allowed overlap with requiredDVNs
}

function convertUlnConfig(config: UlnConfig) {
    return {
        confirmations: config.confirmations.toString(),
        requiredDVNCount: config.requiredDVNCount.toString(),
        optionalDVNCount: config.optionalDVNCount.toString(),
        optionalDVNThreshold: config.optionalDVNThreshold.toString(),
        requiredDVNs: config.requiredDVNs,
        optionalDVNs: config.optionalDVNs,
    }
}

// Listener function for the PacketSent event
const onPacketSent = async (encodedPacketHex: string, event: ethers.Event) => {
    console.log(`====Packet Sent!`)
    console.log(`Encoded Packet Hex: ${encodedPacketHex}}`)

    /* DVN's job */
    // 0x... to bytes array
    const encodedPacket: Uint8Array = ethers.utils.arrayify(encodedPacketHex)

    // The DVN first listens for the `PacketSent` event.
    // TODO: Deserialize packet
    // const packet: Packet = deserializePacket(encodedPacket)
    // console.log('Packet: ', packet)

    // TODO: After the PacketSent event, the DVNFeePaid is how you know your DVN has been assigned to verify the packet's payloadHash.

    // After receiving the fee, your DVN should query the address of the MessageLib on the destination chain
    const receiverMsgLibDstAddress = await endpointV2Dst.defaultReceiveLibrary(srcEid)
    console.log(`Receiver MessageLib Address: ${receiverMsgLibDstAddress}`)

    // read the MessageLib configuration from it. In the configuration
    // is the required block confirmations to wait before calling verify on
    // the destination chain.
    const receiverMsgLibDst = new ethers.Contract(receiverMsgLibDstAddress, receiverMsgLibAbi, providerDst)

    const ulnConfig: UlnConfig = await receiverMsgLibDst.getUlnConfig(wTsscLzDst.address, srcEid)

    // console.log(`Uln config: ${JSON.stringify(ulnConfig)}`)
    // console.log(`Uln config: ${ulnConfig}`)
    // Convert UlnConfig to a plain object and stringify for readable output
    console.log(`Uln config: ${JSON.stringify(convertUlnConfig(ulnConfig))}`)

    const packetHeader = sliceBytes(encodedPacket, 0, 81)
    console.log(`Header: ${ethers.utils.hexlify(packetHeader)}`)
    const payload = sliceBytes(encodedPacket, 81, encodedPacket.length - 81)
    const payloadHash = ethers.utils.keccak256(payload)
    console.log(`Payload Hash: ${payloadHash}`)

    // verify
    // const tx1 = await receiverUln302Sepolia.connect(signerDst).verify(header, payloadHash, ulnConfig.confirmations)
    const tx1 = await receiverMsgLibDst
        .connect(signerDst)
        .verify(packetHeader, payloadHash, ulnConfig.confirmations.toString())
    const receipt = await tx1.wait()
    console.log(`Verify | tx hash: ${tx1.hash} in block #${receipt.blockNumber}`)

    // commit verification
    const tx2 = await receiverMsgLibDst
        .connect(signerDst)
        .commitVerification(packetHeader, payloadHash, { gasLimit: 200000 })
    const receipt2 = await tx2.wait()
    console.log(`CommitVerification | tx hash: ${tx2.hash} in block #${receipt2.blockNumber}`)

    /* TODO: Executor's job */
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

        const receiverUln302AddressSepolia = process.env.SEPOLIA_RECEIVERULN302 || ''
        const wTsscLzAddressSepolia = process.env.WTSSCLZ_SEPOLIA || ''
        const endpointV2AddressSepolia = process.env.SEPOLIA_ENDPOINT_V2 || ''

        // EIDs
        srcEid = Number(process.env.NOVA_ENDPOINT_V2_ID)
        dstEid = Number(process.env.SEPOLIA_ENDPOINT_V2_ID)

        // providers
        const nova_provider = new ethers.providers.JsonRpcProvider(process.env.SRC_RPC_URL)
        providerDst = new ethers.providers.JsonRpcProvider(process.env.DST_RPC_URL)

        // signers
        signerSrc = new ethers.Wallet(process.env.PRIVATE_KEY || '', nova_provider)
        signerDst = new ethers.Wallet(process.env.PRIVATE_KEY || '', providerDst)

        // contract instances
        // const counterContract = new ethers.Contract(counterAddress, abi, nova_provider)
        const wTsscLzNova = new ethers.Contract(wTsscLzAddressNova, wTsscLzAbi, nova_provider)
        const sendUln302Nova = new ethers.Contract(sendUln302AddressNova, sendUln302Abi, nova_provider)
        const endpointV2Nova = new ethers.Contract(endpointV2AddressNova, endpointV2Abi, nova_provider)

        wTsscLzDst = new ethers.Contract(wTsscLzAddressSepolia, wTsscLzAbi, providerDst)
        endpointV2Dst = new ethers.Contract(endpointV2AddressSepolia, endpointV2Abi, providerDst)

        // Subscribe to the event
        // counterContract.on('NumberSet', onNumberSet)
        wTsscLzNova.on('Transfer', onTransferSrc)
        sendUln302Nova.on('ExecutorFeePaid', onExecutorFeePaid)
        sendUln302Nova.on('DVNFeePaid', onDVNFeePaid)
        endpointV2Nova.on('PacketSent', onPacketSent)
        wTsscLzNova.on('OFTSent', onOFTSent)

        wTsscLzDst.on('Transfer', onTransferDst)
        wTsscLzDst.on('OFTReceived', onOFTReceived)
        endpointV2Dst.on('PacketDelivered', onPacketDelivered)

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
