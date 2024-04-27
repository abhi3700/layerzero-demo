/* 

This script is to run Subspace's native DVN, Exectuor layer.

All the txs take place on Dst chain (eg. Sepolia in this case).

TODO:
- Queuing (sequential execution) of messages from same sender contract.
- Use Rust’s concurrency for parallel (rayon crate) verification of messages coming from different sender contracts.
*/

// Import ethers from the ethers package
import { BigNumber, ethers } from 'ethers'
import { loadEnv, sliceBytes } from '../utils'
import { MessageOrigin, Packet, PacketSerializer, bytes32ToEthAddress } from '@layerzerolabs/lz-v2-utilities'
import WTsscLzJson from '../../abi/WTsscLz.json'
import SendUln302Json from '../../abi/SendUln302.json'
import ReceiveUln302Json from '../../abi/ReceiveUln302.json'
import EndpointV2Json from '../../abi/EndpointV2.json'
import DVNJson from '../../abi/DVN.json'

loadEnv()

// Contracts declaration
let endpointV2Src: ethers.Contract,
    endpointV2Dst: ethers.Contract,
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

// Endpoint IDs
let srcEid: number

// ABIs
const wTsscLzAbi = WTsscLzJson.abi
const sendUln302Abi = SendUln302Json.abi
const receiverMsgLibAbi = ReceiveUln302Json.abi
const endpointV2Abi = EndpointV2Json.abi
const dvnAbi = DVNJson.abi

const onTransferSrc = async (from: string, to: string, amount: BigNumber, event: ethers.Event) => {
    // console.log(`======Transfer! Source======`)
    // console.log(`\tFrom: ${from}, \n\tTo: ${to}, \n\tAmount: ${amount.toString()}`)
}

const onExecutorFeePaid = async (executor: string, fee: BigNumber, event: ethers.Event) => {
    // console.log(`======Executor Fee Paid!======`)
    // console.log(`\tExecutor: ${executor}, \n\tFee: ${fee.toString()}`)
}

const onDVNFeePaid = async (
    requiredSrcDVNs: string[],
    optionalDVNs: string[],
    fees: BigNumber[],
    event: ethers.Event
) => {
    // console.log(`======DVN Fee Paid!======`)
    // console.log(
    //     `\tRequired Src DVNs: ${requiredSrcDVNs}, \n\tOptional DVNs: ${optionalDVNs}, \n\tFees: ${fees.toString()}`
    // )
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
const onPacketSent = async (encodedPacketHex: string, options: string, sendLibrary: string, event: ethers.Event) => {
    // 0x... to bytes array
    const encodedPacket: Uint8Array = ethers.utils.arrayify(encodedPacketHex)
    const decodedPacket: Packet = PacketSerializer.deserialize(encodedPacket)
    const nonce = decodedPacket.nonce
    // console.log(`\tDecoded Packet: ${JSON.stringify(decodedPacket)}`)
    console.log('=====================================================')
    console.log(
        `📤 Packet Sent from Nova 🔗:\n\t- Nonce: ${nonce}\n\t- Sender contract: ${ethers.utils.hexStripZeros(decodedPacket.sender)}`
    )
    console.log(`\tEncoded Packet Hex: ${encodedPacketHex}\n\tOptions: ${options}\n\tSend Library: ${sendLibrary}`)
    console.log('=====================================================')
    console.log('🚚 Status: Inflight')
    console.log('=====================================================')

    /* DVN's job */

    // The DVN first listens for the `PacketSent` event.

    // NOTE: After the PacketSent event, the DVNFeePaid is how you know your DVN has been assigned to verify the packet's payloadHash.

    // After receiving the fee, your DVN should query the address of the MessageLib on the destination chain
    const receiverMsgLibDstAddress = await endpointV2Dst.defaultReceiveLibrary(srcEid)
    // console.log(`Receiver MessageLib Address: ${receiverMsgLibDstAddress}`)

    // read the MessageLib configuration from it. In the configuration
    // is the required block confirmations to wait before calling verify on
    // the destination chain.
    const receiverMsgLibDst = new ethers.Contract(receiverMsgLibDstAddress, receiverMsgLibAbi, providerDst)

    const ulnConfig: UlnConfig = await receiverMsgLibDst.getUlnConfig(wTsscLzDst.address, srcEid)

    // Convert UlnConfig to a plain object and stringify for readable output
    // console.log(`Uln config: ${JSON.stringify(convertUlnConfig(ulnConfig))}`)

    const packetHeader = sliceBytes(encodedPacket, 0, 81)
    // console.log(`Header: ${ethers.utils.hexlify(packetHeader)}`)
    const payload = sliceBytes(encodedPacket, 81, encodedPacket.length - 81)
    const payloadHash = ethers.utils.keccak256(payload)
    // console.log(`Payload Hash: ${payloadHash}`)

    // sign by DVN to verify the message
    dvnDst = new ethers.Contract(ulnConfig.requiredDVNs[0], dvnAbi, providerDst)
    const tx1 = await dvnDst
        .connect(signerDst)
        .verify(receiverMsgLibDstAddress, packetHeader, payloadHash, ulnConfig.confirmations.toString(), {
            gasLimit: 200000,
        })
    const receipt1 = await tx1.wait()
    console.log(`\n🔍 DVN verifies\n   - Transaction Hash: ${tx1.hash}\n   - Block Number: #${receipt1.blockNumber}`)

    // Idempotent check if verifiable
    const isVerifiable = await receiverMsgLibDst.verifiable(
        ulnConfig,
        ethers.utils.keccak256(packetHeader),
        payloadHash
    )
    // console.log(`\nIs Verifiable: ${isVerifiable}`)
    if (!isVerifiable) {
        throw new Error('Packet is not verifiable')
    }

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

    /* Executor's job */
    // NOTE: After the PacketSent event, the ExecutorFeePaid is how you know your Executor has been assigned to verify the packet's payloadHash.
    // Execute i.e. call `lzReceive` fn

    const origin: MessageOrigin = {
        srcEid: decodedPacket.srcEid,
        sender: decodedPacket.sender,
        nonce: decodedPacket.nonce,
    }

    const tx3 = await endpointV2Dst.connect(signerDst).lzReceive(
        origin,
        bytes32ToEthAddress(ethers.utils.arrayify(decodedPacket.receiver)),
        decodedPacket.guid,
        decodedPacket.message,
        ethers.utils.formatBytes32String(''),
        { gasLimit: 200000 } // actual consumption is somewhere around 40k gas
    )
    const receipt3 = await tx3.wait()
    console.log(`\n📬 lzReceive\n   - Transaction Hash: ${tx3.hash}\n   - Block Number: #${receipt3.blockNumber}`)

    console.log('=====================================================')
    console.log('✅ Status: Delivered')
    console.log('=====================================================')
    console.log('🎉 Token transfer complete!')
}

const onOFTSent = async (
    guid: string,
    dstEid: number,
    fromAddress: string,
    amounSentLD: BigNumber,
    amountReceivedLD: BigNumber,
    event: ethers.Event
) => {
    // console.log(`======OFT Sent!======`)
    // console.log(
    //     `\tGuid: ${guid}, \n\tDstEid: ${dstEid}, \n\tFrom: ${fromAddress}, \n\tAmountSentLD: ${amounSentLD.toString()}, \n\tAmountReceivedLD: ${amountReceivedLD.toString()}`
    // )
}

const onTransferDst = async (from: string, to: string, amount: BigNumber, event: ethers.Event) => {
    // console.log(`======Transfer! Destination======`)
    // console.log(`\tFrom: ${from}, \n\tTo: ${to}, \n\tAmount: ${amount.toString()}`)
}

const onOFTReceived = async (
    guid: string,
    srcEid: number,
    toAddress: string,
    amountReceivedLD: BigNumber,
    event: ethers.Event
) => {
    // console.log(`======OFT Received!======`)
    // console.log(
    //     `\tGuid: ${guid}, \n\tSrcEid: ${srcEid}, \n\tTo: ${toAddress}, \n\tAmountReceivedLD: ${amountReceivedLD.toString()}`
    // )
}

const onPacketDelivered = async (origin: MessageOrigin, receiver: string, event: ethers.Event) => {
    // console.log(`======Packet Delivered!======`)
    // console.log(`\tOrigin: ${origin}, \n\tReceiver: ${receiver}`)
}

async function main() {
    try {
        const wTsscLzAddressNova = process.env.WTSSCLZ_NOVA || ''
        const sendUln302AddressNova = process.env.NOVA_SENDULN302 || ''
        const endpointV2AddressNova = process.env.NOVA_ENDPOINT_V2 || ''

        const wTsscLzAddressSepolia = process.env.WTSSCLZ_SEPOLIA || ''
        const endpointV2AddressSepolia = process.env.SEPOLIA_ENDPOINT_V2 || ''

        // EIDs
        srcEid = Number(process.env.NOVA_ENDPOINT_V2_ID)
        // dstEid = Number(process.env.SEPOLIA_ENDPOINT_V2_ID)

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
            endpointV2AddressSepolia === ''
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
