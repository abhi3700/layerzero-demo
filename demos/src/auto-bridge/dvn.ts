/* 
## About
This script acts as bridge script for detecting message packet sent
from Nova and delivering it to Sepolia.

> Between any 2 EVM chains.

All the txs like verification & execution are done on Dst chain (eg. Sepolia in this case).

Technically, there are 3 txs happening by the bridge script on the dst chain to make a message packet
marked as delivered.
> And the same message packet can't be redelivered as its nonce on the contract storage is already marked as delivered.

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
import { loadEnv, setVerbosity, sliceBytes } from '../utils'
import { MessageOrigin, Packet, PacketSerializer, bytes32ToEthAddress } from '@layerzerolabs/lz-v2-utilities'
import WTsscLzJson from '../../abi/WTsscLz.json'
import SendUln302Json from '../../abi/SendUln302.json'
import ReceiveUln302Json from '../../abi/ReceiveUln302.json'
import EndpointV2Json from '../../abi/EndpointV2.json'
import EndpointV2ViewJson from '../../abi/EndpointV2View.json'
import DVNJson from '../../abi/DVN.json'
import log from 'loglevel'

loadEnv()

// Contracts declaration
let endpointV2Src: ethers.Contract,
    endpointV2Dst: ethers.Contract,
    endpointV2ViewDst: ethers.Contract,
    wTsscLzSrc: ethers.Contract,
    wTsscLzDst: ethers.Contract,
    sendUln302Src: ethers.Contract,
    dvnDst: ethers.Contract

// Signers
// NOTE: both src & dst chains kept same for PoC
// let signerSrc: ethers.Wallet,
let signerDst: ethers.Wallet

// Provider
let providerSrc: ethers.providers.Provider, providerDst: ethers.providers.Provider

// ABIs
const wTsscLzAbi = WTsscLzJson.abi
const sendUln302Abi = SendUln302Json.abi
const receiverMsgLibAbi = ReceiveUln302Json.abi
const endpointV2Abi = EndpointV2Json.abi
const endpointV2ViewAbi = EndpointV2ViewJson.abi
const dvnAbi = DVNJson.abi

const onTransferSrc = async (from: string, to: string, amount: BigNumber, event: ethers.Event) => {
    log.debug(`======Transfer! Source======`)
    log.debug(`\tFrom: ${from}, \n\tTo: ${to}, \n\tAmount: ${amount.toString()}`)
}

const onExecutorFeePaid = async (executor: string, fee: BigNumber, event: ethers.Event) => {
    log.debug(`======Executor Fee Paid!======`)
    log.debug(`\tExecutor: ${executor}, \n\tFee: ${fee.toString()}`)
}

const onDVNFeePaid = async (
    requiredSrcDVNs: string[],
    optionalDVNs: string[],
    fees: BigNumber[],
    event: ethers.Event
) => {
    log.debug(`======DVN Fee Paid!======`)
    log.debug(
        `\tRequired Src DVNs: ${requiredSrcDVNs}, \n\tOptional DVNs: ${optionalDVNs}, \n\tFees: ${fees.toString()}`
    )
}

interface UlnConfig {
    confirmations: BigNumber // we store the length of required DVNs and optional DVNs instead of using DVN.length directly to save gas
    requiredDVNCount: BigNumber // 0 indicate DEFAULT, NIL_DVN_COUNT indicate NONE (to override the value of default)
    optionalDVNCount: BigNumber // 0 indicate DEFAULT, NIL_DVN_COUNT indicate NONE (to override the value of default)
    optionalDVNThreshold: BigNumber // (0, optionalDVNCount]
    requiredDVNs: string[] // no duplicates. sorted an an ascending order. allowed overlap with optionalDVNs
    optionalDVNs: string[] // no duplicates. sorted an an ascending order. allowed overlap with requiredDVNs
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
const onPacketSent = async (encodedPacketHex: string, options: string, sendLibrary: string, event: ethers.Event) => {
    // 0x... to bytes array
    const encodedPacket: Uint8Array = ethers.utils.arrayify(encodedPacketHex)
    const decodedPacket: Packet = PacketSerializer.deserialize(encodedPacket)
    const { nonce, srcEid, sender, dstEid, receiver, version, guid, message, payload } = decodedPacket
    const origin: MessageOrigin = {
        srcEid: srcEid,
        sender: sender,
        nonce: nonce,
    }

    log.debug(`\tDecoded Packet: ${JSON.stringify(decodedPacket)}`)

    console.log('=====================================================')
    console.log(
        `📤 Packet Sent from Nova 🔗:\n\t- Nonce: ${nonce}\n\t- Sender contract: ${ethers.utils.hexStripZeros(sender)}`
    )

    log.info(`\tEncoded Packet Hex: ${encodedPacketHex}`)
    log.debug(`\tOptions: ${options}\n\tSend Library: ${sendLibrary}`)

    /* DVN's job */
    // The DVN first listens for the `PacketSent` event.
    // NOTE: After the PacketSent event, the DVNFeePaid is how you know your DVN has been assigned to verify the packet's payloadHash.

    // After receiving the fee, your DVN should query the address of the MessageLib on the destination chain
    const receiverMsgLibDstAddress = await endpointV2Dst.defaultReceiveLibrary(srcEid)
    log.debug(`Receiver MessageLib Address: ${receiverMsgLibDstAddress}`)

    // read the MessageLib configuration from it. In the configuration
    // is the required block confirmations to wait before calling verify on
    // the destination chain.
    const receiverMsgLibDst = new ethers.Contract(receiverMsgLibDstAddress, receiverMsgLibAbi, providerDst)

    const ulnConfig: UlnConfig = await receiverMsgLibDst.getUlnConfig(wTsscLzDst.address, srcEid)
    log.debug(`Uln config: ${JSON.stringify(convertUlnConfig(ulnConfig))}`)

    const packetHeader = sliceBytes(encodedPacket, 0, 81)
    log.debug(`Header: ${ethers.utils.hexlify(packetHeader)}`)
    // const payload = sliceBytes(encodedPacket, 81, encodedPacket.length - 81)
    const payloadHash = ethers.utils.keccak256(payload)
    log.debug(`Payload Hash: ${payloadHash}`)

    const status0: ExecutionState = await endpointV2ViewDst.executable(
        origin,
        bytes32ToEthAddress(ethers.utils.arrayify(receiver))
    )
    log.debug(`\nStatus before DVN verify?\n  ${status0}`)

    if (status0 === ExecutionState.NotExecutable) {
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
            `\n🔍 DVN verifies\n   - Transaction Hash: ${tx1.hash}\n   - Block Number: #${receipt1.blockNumber}`
        )

        const status1: ExecutionState = await endpointV2ViewDst.executable(
            origin,
            bytes32ToEthAddress(ethers.utils.arrayify(receiver))
        )
        log.debug(`\nStatus after DVN verify?\n  ${status1}`)

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
    }

    const status2: ExecutionState = await endpointV2ViewDst.executable(
        origin,
        bytes32ToEthAddress(ethers.utils.arrayify(receiver))
    )
    log.debug(`\nStatus after commit verification?\n  ${status2}`)
    if (status2 === ExecutionState.Executable) {
        /* Executor's job */
        // NOTE: After the PacketSent event, the ExecutorFeePaid is how you know your Executor has been assigned to verify the packet's payloadHash.
        // Execute i.e. call `lzReceive` fn
        const tx3 = await endpointV2Dst.connect(signerDst).lzReceive(
            origin,
            bytes32ToEthAddress(ethers.utils.arrayify(receiver)),
            guid,
            message,
            ethers.utils.formatBytes32String(''),
            { gasLimit: 200000 } // actual consumption is somewhere around 40k gas
        )
        const receipt3 = await tx3.wait()
        console.log(`\n📬 lzReceive\n   - Transaction Hash: ${tx3.hash}\n   - Block Number: #${receipt3.blockNumber}`)

        console.log('=====================================================')
        console.log('✅ Status: Delivered')
        console.log('=====================================================')
        console.log('🎉 Token transfer complete!')
    } else {
        console.error(`🚫 Packet is not executable as it's ${getExecutionStateName(status2)}.`)
    }
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
        `\tGuid: ${guid}, \n\tDstEid: ${dstEid}, \n\tFrom: ${fromAddress}, \n\tAmountSentLD: ${amounSentLD.toString()}, \n\tAmountReceivedLD: ${amountReceivedLD.toString()}`
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
    log.debug(`\tOrigin: ${origin}, \n\tReceiver: ${receiver}`)
}

async function main(verbosity: string) {
    try {
        setVerbosity(verbosity)

        const wTsscLzAddressNova = process.env.WTSSCLZ_NOVA || ''
        const sendUln302AddressNova = process.env.NOVA_SENDULN302 || ''
        const endpointV2AddressNova = process.env.NOVA_ENDPOINT_V2 || ''

        const wTsscLzAddressSepolia = process.env.WTSSCLZ_SEPOLIA || ''
        const endpointV2AddressSepolia = process.env.SEPOLIA_ENDPOINT_V2 || ''
        const endpointV2ViewAddressSepolia = process.env.SEPOLIA_ENDPOINT_VIEW_V2 || ''

        // providers
        providerSrc = new ethers.providers.JsonRpcProvider(process.env.SRC_RPC_URL)
        providerDst = new ethers.providers.JsonRpcProvider(process.env.DST_RPC_URL)

        // signers
        // signerSrc = new ethers.Wallet(process.env.PRIVATE_KEY || '', providerSrc)
        signerDst = new ethers.Wallet(process.env.PRIVATE_KEY || '', providerDst)

        // contract instances
        wTsscLzSrc = new ethers.Contract(wTsscLzAddressNova, wTsscLzAbi, providerSrc)
        sendUln302Src = new ethers.Contract(sendUln302AddressNova, sendUln302Abi, providerSrc)
        endpointV2Src = new ethers.Contract(endpointV2AddressNova, endpointV2Abi, providerSrc)

        wTsscLzDst = new ethers.Contract(wTsscLzAddressSepolia, wTsscLzAbi, providerDst)
        endpointV2Dst = new ethers.Contract(endpointV2AddressSepolia, endpointV2Abi, providerDst)
        endpointV2ViewDst = new ethers.Contract(endpointV2ViewAddressSepolia, endpointV2ViewAbi, providerDst)

        // Subscribe to the events
        wTsscLzSrc.on('Transfer', onTransferSrc)
        sendUln302Src.on('ExecutorFeePaid', onExecutorFeePaid)
        sendUln302Src.on('DVNFeePaid', onDVNFeePaid)
        endpointV2Src.on('PacketSent', onPacketSent)
        wTsscLzSrc.on('OFTSent', onOFTSent)

        wTsscLzDst.on('Transfer', onTransferDst)
        wTsscLzDst.on('OFTReceived', onOFTReceived)
        endpointV2Dst.on('PacketDelivered', onPacketDelivered)

        if (
            wTsscLzAddressNova === '' ||
            sendUln302AddressNova === '' ||
            endpointV2AddressNova === '' ||
            wTsscLzAddressSepolia === '' ||
            endpointV2AddressSepolia === '' ||
            endpointV2ViewAddressSepolia === ''
        ) {
            throw Error('All contracts must be non-zero')
        }

        // Listen for events on the contract
        console.log(
            `Listening for emitted events from WTsscLZ: ${wTsscLzAddressNova.slice(0, 6)}...${wTsscLzAddressNova.slice(-4)} on Nova...`
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
