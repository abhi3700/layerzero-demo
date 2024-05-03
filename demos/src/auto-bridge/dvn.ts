/* 
## About
This script acts as bridge script for detecting message packet sent
from Nova and delivering it to Sepolia and viceversa.

> Ideally, between any 2 EVM chains.

All the txs like verification & execution are done on destination chain.

Technically, there are 3 txs happening by the bridge script on the dst chain to make a message packet
marked as delivered.
> And the same message packet can't be redelivered as its nonce on the contract storage is already marked as executed.

## Run

```sh
# Run in production mode
bun auto-bridge:dvn

# Run in trace mode
bun auto-bridge:dvn trace

# Run in debug mode
bun auto-bridge:dvn debug

# Run in info mode
bun auto-bridge:dvn info
```


## TODO:
- Queuing (sequential execution) of messages from same sender contract.
- Use Rust’s concurrency for parallel (rayon crate) verification of messages coming from different sender contracts.

*/

// Import ethers from the ethers package
import { BigNumber, ethers } from 'ethers'
import { getEnvVar, loadEnv, setVerbosity, sliceBytes } from '../utils'
import { MessageOrigin, Packet, PacketSerializer } from '@layerzerolabs/lz-v2-utilities'
import WTsscLzJson from '../../abi/WTsscLz.json'
import SendUln302Json from '../../abi/SendUln302.json'
import ReceiveUln302Json from '../../abi/ReceiveUln302.json'
import EndpointV2Json from '../../abi/EndpointV2.json'
import EndpointV2ViewJson from '../../abi/EndpointV2View.json'
import DVNJson from '../../abi/DVN.json'
import log from 'loglevel'
import { getNetworkNameFromEid } from '../utils'

loadEnv()

// Contracts declaration
let endpointV2Nova: ethers.Contract,
    endpointV2Sepolia: ethers.Contract,
    endpointV2ViewNova: ethers.Contract,
    endpointV2ViewSepolia: ethers.Contract,
    wTsscLzNova: ethers.Contract,
    wTsscLzSepolia: ethers.Contract,
    sendUln302Nova: ethers.Contract,
    sendUln302Sepolia: ethers.Contract,
    dvnNova: ethers.Contract,
    dvnDst: ethers.Contract

// Signers
// NOTE: both src & dst chains kept same for PoC
let signerNova: ethers.Wallet, signerSepolia: ethers.Wallet

// Provider
let providerNova: ethers.providers.Provider, providerSepolia: ethers.providers.Provider

// ABIs
const wTsscLzAbi = WTsscLzJson.abi
const sendUln302Abi = SendUln302Json.abi
const receiverMsgLibAbi = ReceiveUln302Json.abi
const endpointV2Abi = EndpointV2Json.abi
const endpointV2ViewAbi = EndpointV2ViewJson.abi
const dvnAbi = DVNJson.abi

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

enum ExecutionState {
    NotExecutable, // or Verifiable. executor: waits for PayloadVerified event and starts polling for executable
    VerifiedButNotExecutable, // executor: starts active polling for executable
    Executable,
    Executed,
}

function getExecutionStateName(state: ExecutionState): string {
    return ExecutionState[state]
}

const onTransferSrc = async (from: string, to: string, amount: BigNumber, event: ethers.Event) => {
    log.debug(`======Transfer! Source======`)
    log.debug(`\tFrom: ${from}, \n\tTo: ${to}, \n\tAmount: ${amount.toString()}`)
}

const onExecutorFeePaid = async (executor: string, fee: BigNumber, event: ethers.Event) => {
    log.debug(`======ExecutorFeePaid!======`)
    log.debug(`\tExecutor: ${executor}, \n\tFee: ${fee.toString()}`)
}

const onDVNFeePaid = async (requiredDVNs: string[], optionalDVNs: string[], fees: BigNumber[], event: ethers.Event) => {
    log.debug(`======DVNFeePaid!======`)
    log.debug(`\tRequired DVNs: ${requiredDVNs}, \n\tOptional DVNs: ${optionalDVNs}, \n\tFees: ${fees.toString()}`)
}

type PacketInfo = Packet & { packetHeader: Uint8Array; payloadHash: string }

function getPacketInfo(encodedPacketHex: string): PacketInfo {
    // 0x... to bytes array
    const encodedPacket: Uint8Array = ethers.utils.arrayify(encodedPacketHex)
    const decodedPacket: Packet = PacketSerializer.deserialize(encodedPacket)
    const { version, nonce, srcEid, sender, dstEid, receiver, guid, message, payload } = decodedPacket
    console.log('=====================================================')
    console.log(`📤 Packet Sent:`)
    console.log(
        `\t- From: ${getNetworkNameFromEid(srcEid)}\n\t- To: ${getNetworkNameFromEid(dstEid)}\n\t- Sender contract: ${ethers.utils.hexStripZeros(sender)}\n\t- Nonce: ${nonce}`
    )

    log.debug(`\tDecoded Packet: ${JSON.stringify(decodedPacket, null, 2)}`)
    log.info(`\tEncoded Packet Hex: ${encodedPacketHex}`)
    const packetHeader = sliceBytes(encodedPacket, 0, 81)
    log.debug(`Header: ${ethers.utils.hexlify(packetHeader)}`)
    const payloadHash = ethers.utils.keccak256(payload)
    log.debug(`Payload Hash: ${payloadHash}`)

    return {
        version,
        nonce,
        srcEid,
        sender,
        dstEid,
        receiver,
        guid,
        message,
        payload,
        packetHeader,
        payloadHash,
    }
}

// Listener function for the PacketSent event
const onPacketSent = async (
    encodedPacketHex: string,
    options: string,
    sendLibrary: string,
    endpointV2Dst: ethers.Contract,
    endpointV2ViewDst: ethers.Contract,
    signerDst: ethers.Wallet,
    providerDst: ethers.providers.Provider,
    event: ethers.Event
) => {
    log.debug(`\tEncoded Packet Hex: ${encodedPacketHex}\n\tOptions: ${options}\n\tSend Library: ${sendLibrary}`)

    const { version, nonce, srcEid, sender, dstEid, receiver, guid, message, payload, packetHeader, payloadHash } =
        getPacketInfo(encodedPacketHex)
    const senderAddress = ethers.utils.hexStripZeros(sender)
    const receiverAddress = ethers.utils.hexStripZeros(receiver)
    const origin: MessageOrigin = {
        srcEid: srcEid,
        sender: sender,
        nonce: nonce,
    }

    /* DVN's job */
    // The DVN first listens for the `PacketSent` event.
    // NOTE: After the PacketSent event, the DVNFeePaid is how you know your DVN has been assigned to verify the packet's payloadHash.

    // After receiving the fee, your DVN should query the address of the MessageLib on the destination chain
    const receiverMsgLibDstAddress = await endpointV2Dst.defaultReceiveLibrary(srcEid)
    log.debug(`Receiver MessageLib Address: ${receiverMsgLibDstAddress}`)
    const receiverMsgLibDst = new ethers.Contract(receiverMsgLibDstAddress, receiverMsgLibAbi, providerDst)

    // read the MessageLib configuration from it. In the configuration
    // is the required block confirmations to wait before calling verify on
    // the destination chain.
    const ulnConfig: UlnConfig = await receiverMsgLibDst.getUlnConfig(senderAddress, srcEid)
    log.debug(`Uln config: ${JSON.stringify(convertUlnConfig(ulnConfig), null, 2)}`)

    const executionStatus0: ExecutionState = await endpointV2ViewDst.executable(origin, receiverAddress)
    log.debug(`\nStatus before DVN verify?\n  ${executionStatus0}`)

    if (executionStatus0 === ExecutionState.NotExecutable) {
        console.log('=====================================================')
        console.log('🚚 Status: Inflight')
        console.log('=====================================================')

        // sign by DVN to verify the message
        dvnDst = new ethers.Contract(ulnConfig.requiredDVNs[0], dvnAbi, providerDst)
        const tx1 = await dvnDst
            .connect(signerDst)
            .verify(receiverMsgLibDstAddress, packetHeader, payloadHash, ulnConfig.confirmations.toString(), {
                gasLimit: 200000,
            })
        const receipt1 = await tx1.wait()
        console.log(
            `\n🔍 DVN Verification\n   - Transaction Hash: ${tx1.hash}\n   - Block Number: #${receipt1.blockNumber}`
        )

        const executionStatus1: ExecutionState = await endpointV2ViewDst.executable(origin, receiverAddress)
        log.debug(`\nStatus after DVN verify?\n  ${executionStatus1}`)

        // Idempotent check if verifiable
        const isVerifiable: boolean = await receiverMsgLibDst.verifiable(
            ulnConfig,
            ethers.utils.keccak256(packetHeader),
            payloadHash
        )

        if (isVerifiable) {
            console.log('=====================================================')
            console.log(`🔄 Status: Confirming`)
            console.log('=====================================================')

            // commit verification
            const tx2 = await receiverMsgLibDst
                .connect(signerDst)
                .commitVerification(packetHeader, payloadHash, { gasLimit: 200000 })
            const receipt2 = await tx2.wait()
            console.log(
                `\n✔️ Commit Verification\n   - Transaction Hash: ${tx2.hash}\n   - Block Number: #${receipt2.blockNumber}`
            )
        } else {
            console.error(`❌ Packet is not verifiable`)
        }
    }

    const executionStatus2: ExecutionState = await endpointV2ViewDst.executable(origin, receiverAddress)
    log.debug(`\nStatus after commit verification?\n  ${executionStatus2}`)
    if (executionStatus2 === ExecutionState.Executable) {
        /* Executor's job */
        // NOTE: After the PacketSent event, the ExecutorFeePaid is how you know your Executor has been assigned to verify the packet's payloadHash.
        // Execute i.e. call `lzReceive` fn
        const tx3 = await endpointV2Dst.connect(signerDst).lzReceive(
            origin,
            receiverAddress,
            guid,
            message,
            ethers.utils.formatBytes32String(''),
            { gasLimit: 200000 } // actual consumption is somewhere around 40k gas
        )
        const receipt3 = await tx3.wait()
        console.log(`\n📬 Execution\n   - Transaction Hash: ${tx3.hash}\n   - Block Number: #${receipt3.blockNumber}`)

        console.log('=====================================================')
        console.log('✅ Status: Delivered')
        console.log(
            `\t- From: ${getNetworkNameFromEid(srcEid)}\n\t- To: ${getNetworkNameFromEid(dstEid)}\n\t- Sender contract: ${senderAddress}\n\t- Nonce: ${nonce}`
        )
        console.log('=====================================================')
        console.log('🎉 Token transfer complete!')
        console.log('=====================================================')
    } else {
        console.error(`🚫 Packet is not executable as it's ${getExecutionStateName(executionStatus2)}.`)
    }
}

const onPacketSentNova = async (
    encodedPacketHex: string,
    options: string,
    sendLibrary: string,
    event: ethers.Event
) => {
    await onPacketSent(
        encodedPacketHex,
        options,
        sendLibrary,
        endpointV2Sepolia,
        endpointV2ViewSepolia,
        signerSepolia,
        providerSepolia,
        event
    )
}

const onPacketSentSepolia = async (
    encodedPacketHex: string,
    options: string,
    sendLibrary: string,
    event: ethers.Event
) => {
    await onPacketSent(
        encodedPacketHex,
        options,
        sendLibrary,
        endpointV2Nova,
        endpointV2ViewNova,
        signerNova,
        providerNova,
        event
    )
}

const onOFTSent = async (
    guid: string,
    dstEid: number,
    fromAddress: string,
    amounSentLD: BigNumber,
    amountReceivedLD: BigNumber,
    event: ethers.Event
) => {
    log.debug(`======OFT Sent!======`)
    log.debug(
        `\tGuid: ${guid}, \n\tdstEid: ${dstEid}, \n\tFrom: ${fromAddress}, \n\tAmountSentLD: ${amounSentLD.toString()}, \n\tAmountReceivedLD: ${amountReceivedLD.toString()}`
    )
}

const onTransferDst = async (from: string, to: string, amount: BigNumber, event: ethers.Event) => {
    log.debug(`======Transfer! Destination======`)
    log.debug(`\tFrom: ${from}, \n\tTo: ${to}, \n\tAmount: ${amount.toString()}`)
}

const onOFTReceived = async (
    guid: string,
    srcEid: number,
    toAddress: string,
    amountReceivedLD: BigNumber,
    event: ethers.Event
) => {
    log.debug(`======OFT Received!======`)
    log.debug(
        `\tGuid: ${guid}, \n\tSrcEid: ${srcEid}, \n\tTo: ${toAddress}, \n\tAmountReceivedLD: ${amountReceivedLD.toString()}`
    )
}

const onPacketDelivered = async (origin: MessageOrigin, receiver: string, event: ethers.Event) => {
    log.debug(`======Packet Delivered!======`)
    log.debug(`\tOrigin: ${JSON.stringify(origin, null, 2)}, \n\tReceiver: ${receiver}`)
}

async function main(verbosity: string) {
    try {
        setVerbosity(verbosity)

        const wTsscLzAddressNova = getEnvVar('WTSSCLZ_NOVA')
        const sendUln302AddressNova = getEnvVar('NOVA_SENDULN302')
        const endpointV2AddressNova = getEnvVar('NOVA_ENDPOINT_V2')
        const endpointV2ViewAddressNova = getEnvVar('NOVA_ENDPOINT_VIEW_V2')

        const wTsscLzAddressSepolia = getEnvVar('WTSSCLZ_SEPOLIA')
        const sendUln302AddressSepolia = getEnvVar('SEPOLIA_SENDULN302')
        const endpointV2AddressSepolia = getEnvVar('SEPOLIA_ENDPOINT_V2')
        const endpointV2ViewAddressSepolia = getEnvVar('SEPOLIA_ENDPOINT_VIEW_V2')

        /* providers */
        providerNova = new ethers.providers.JsonRpcProvider(getEnvVar('SRC_RPC_URL'))
        providerSepolia = new ethers.providers.JsonRpcProvider(getEnvVar('DST_RPC_URL'))

        /* signers */
        signerNova = new ethers.Wallet(getEnvVar('PRIVATE_KEY'), providerNova)
        signerSepolia = new ethers.Wallet(getEnvVar('PRIVATE_KEY'), providerSepolia)

        /* contract instances */
        // src
        wTsscLzNova = new ethers.Contract(wTsscLzAddressNova, wTsscLzAbi, providerNova)
        sendUln302Nova = new ethers.Contract(sendUln302AddressNova, sendUln302Abi, providerNova)
        endpointV2Nova = new ethers.Contract(endpointV2AddressNova, endpointV2Abi, providerNova)
        endpointV2ViewNova = new ethers.Contract(endpointV2ViewAddressNova, endpointV2ViewAbi, providerNova)

        // dst
        wTsscLzSepolia = new ethers.Contract(wTsscLzAddressSepolia, wTsscLzAbi, providerSepolia)
        sendUln302Sepolia = new ethers.Contract(sendUln302AddressSepolia, sendUln302Abi, providerSepolia)
        endpointV2Sepolia = new ethers.Contract(endpointV2AddressSepolia, endpointV2Abi, providerSepolia)
        endpointV2ViewSepolia = new ethers.Contract(endpointV2ViewAddressSepolia, endpointV2ViewAbi, providerSepolia)

        /* Subscribe to the events.
            Code is in the order of expected events emission.
        */
        // from Nova to Sepolia
        wTsscLzNova.on('Transfer', onTransferSrc)
        sendUln302Nova.on('ExecutorFeePaid', onExecutorFeePaid)
        sendUln302Nova.on('DVNFeePaid', onDVNFeePaid)
        endpointV2Nova.on('PacketSent', onPacketSentNova)
        wTsscLzNova.on('OFTSent', onOFTSent)
        wTsscLzSepolia.on('Transfer', onTransferDst)
        wTsscLzSepolia.on('OFTReceived', onOFTReceived)
        endpointV2Sepolia.on('PacketDelivered', onPacketDelivered)

        // from Sepolia to Nova
        wTsscLzSepolia.on('Transfer', onTransferSrc)
        sendUln302Sepolia.on('ExecutorFeePaid', onExecutorFeePaid)
        sendUln302Sepolia.on('DVNFeePaid', onDVNFeePaid)
        endpointV2Sepolia.on('PacketSent', onPacketSentSepolia)
        wTsscLzSepolia.on('OFTSent', onOFTSent)
        wTsscLzNova.on('Transfer', onTransferDst)
        wTsscLzNova.on('OFTReceived', onOFTReceived)
        endpointV2Nova.on('PacketDelivered', onPacketDelivered)

        /* Listen for events on the contract */
        console.log(
            `Listening to emitted events:\n\t- starting from WTsscLZ: ${wTsscLzAddressNova.slice(0, 6)}...${wTsscLzAddressNova.slice(-4)} on Nova...\n\t- starting from WTsscLZ: ${wTsscLzAddressSepolia.slice(0, 6)}...${wTsscLzAddressSepolia.slice(-4)} on Sepolia...`
        )
    } catch (error) {
        throw new Error(`Panicked 😱 with ${error}`)
    }
}

const verbosity = process.argv[2]
main(verbosity)
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
