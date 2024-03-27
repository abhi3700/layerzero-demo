/**
 * 1 TSSC Token successfully transferred from Sepolia to Mumbai.
 * Tx url: https://testnet.layerzeroscan.com/tx/0x4add361c06fdda00faa7f329ff34d5e1ebc2544104a7cc444f955184dbb74216
 *
 * Takes approx. 5-6 mins to deliver the message to dst chain.
 */

import { Contract, ethers, BigNumber, ContractFactory, BigNumberish } from 'ethers'
import { SendParamStruct, MessagingFeeStruct } from './typechain/contracts/MyToken'
import { Options } from '@layerzerolabs/lz-v2-utilities'
import { hexZeroPad } from 'ethers/lib/utils'
import { config } from 'dotenv'

// load env vars
config()

/* Constants */
// TODO: define max. chains
// const N: number = 2;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// params loaded from some file(s) like `.env`
interface BridgeConfig {
    networkNames: string[]
    chainRpcUrls: string[]
    endpointIds: string[]
    endpointAddresses: string[]
    tokenAddresses: string[]
    privateKey: string
    abi: any
    bytecode: string
}

class TokenBridge {
    private providers: ethers.providers.JsonRpcProvider[]
    public tokens: Contract[]
    public signers: ethers.Wallet[]
    public endpointAddresses: string[]
    public endpointIds: string[]
    private networkNames: string[]
    private abi: any
    private bytecode: string
    private name: string
    private symbol: string

    constructor(config: BridgeConfig, tokenName: string, tokenSymbol: string) {
        this.providers = []
        this.tokens = []
        this.signers = []
        this.endpointAddresses = config.endpointAddresses
        this.endpointIds = config.endpointIds
        this.networkNames = config.networkNames
        this.abi = config.abi
        this.bytecode = config.bytecode
        this.name = tokenName
        this.symbol = tokenSymbol

        for (let i = 0; i < 2; i++) {
            const provider = new ethers.providers.JsonRpcProvider(config.chainRpcUrls[i])
            this.providers.push(provider)
            this.signers.push(new ethers.Wallet(config.privateKey, this.providers[i]))
            this.tokens.push(new ethers.Contract(config.tokenAddresses[i], config.abi, provider))
        }
    }

    /// NOTE: same abi & bytecode deployed on either chains
    public async deployTokens(ownerAddresses?: string[]): Promise<void> {
        const _ownerAddresses = ownerAddresses || this.signers.map((signer) => signer.address)

        for (let i = 0; i < 2; i++) {
            if (this.tokens[i].address === ZERO_ADDRESS) {
                const tokenFactory: ContractFactory = new ethers.ContractFactory(
                    this.abi,
                    this.bytecode,
                    this.signers[i]
                )
                const tokenContract: Contract = await tokenFactory.deploy(
                    this.name,
                    this.symbol,
                    this.endpointAddresses[i],
                    _ownerAddresses[i]
                )
                await tokenContract.deployed()
                console.log(
                    `Token-${i} deployed at address: ${tokenContract.address} with tx hash: ${tokenContract.deployTransaction.hash}`
                )
                this.tokens.push(tokenContract)
            }
        }
    }

    private static async isPeerSet(
        tokenContract: Contract,
        othersEndpointId: string,
        othersPeerAddress: string
    ): Promise<boolean> {
        const paddedPeerAddress = hexZeroPad(othersPeerAddress, 32)
        return await tokenContract.isPeer(othersEndpointId, paddedPeerAddress)
    }

    /// most likely it's a utility for `checkPeersSend`
    private static async checkAndSetPeer(
        tokenContract: Contract,
        othersEndpointId: string,
        othersPeerAddress: string,
        owner: ethers.Wallet,
        networkName: string
    ) {
        const paddedPeerAddress = hexZeroPad(othersPeerAddress, 32)

        if (!(await TokenBridge.isPeerSet(tokenContract, othersEndpointId, othersPeerAddress))) {
            console.log(`Incorrect peer was set on ${networkName}`)
            const tx = await tokenContract.connect(owner).setPeer(othersEndpointId, paddedPeerAddress)
            await tx.wait()
            console.log(`Now, correct peer set on ${networkName} via tx hash: ${tx.hash}`)
        }
    }

    /// check peers and set (via a tx), if incorrect.
    public async setPeers(): Promise<void> {
        await TokenBridge.checkAndSetPeer(
            this.tokens[0],
            this.endpointIds[1],
            this.tokens[1].address,
            this.signers[0],
            this.networkNames[0]
        )
        await TokenBridge.checkAndSetPeer(
            this.tokens[1],
            this.endpointIds[0],
            this.tokens[0].address,
            this.signers[1],
            this.networkNames[1]
        )
    }

    public async getBalancesOf(whoAddress: string): Promise<BigNumber[]> {
        const balances = []
        for (let i = 0; i < 2; ++i) {
            const balOwner = await this.tokens[i].balanceOf(whoAddress)
            console.log(`Owner[${i}]'s token balance: ${ethers.utils.formatEther(balOwner)}`)
            balances.push(balOwner)
        }

        return balances
    }

    public async getTotalSuppliesOf(): Promise<BigNumber[]> {
        const totalSupplies = []
        for (let i = 0; i < 2; ++i) {
            const totSupply = await this.tokens[i].totalSupply()
            console.log(`token[${i}]'s total supply: ${ethers.utils.formatEther(totSupply)}`)
            totalSupplies.push(totSupply)
        }

        return totalSupplies
    }

    /// set enforced params for any contract corresponding to message type like
    ///     SEND, SEND_CALL, etc. which allows to make different message patterns.
    public async setEnforcedParams(token: Contract, otherEndpointId: string) {
        // Generate the EnforcedOptionParam[] array
        let enforcedOptions = [
            {
                eid: otherEndpointId,
                msgType: 1,
                options: '0x00030100110100000000000000000000000000030d40', // hex of 200,000 gas
            },
            {
                eid: otherEndpointId,
                msgType: 2, // SEND_AND_CALL message type
                options: '',
            },
            // ... add more destinations parameters as needed
        ]

        // Call the setEnforcedOptions function
        const tx = await token.setEnforcedOptions(enforcedOptions)
        // Wait for the transaction to be mined
        await tx.wait()

        console.log('Enforced options set successfully via tx hash: ', tx.hash)
    }

    /// send tokens from token A to B on 2 different chains
    public static async sendTokens(
        srcToken: Contract,
        srcSigner: ethers.Wallet,
        amount: BigNumber,
        dstEid: BigNumberish,
        dstTokenAddress: string
    ): Promise<void> {
        // TODO: add gas limit as param
        const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString()
        const sendParams: SendParamStruct = {
            dstEid,
            to: ethers.utils.hexZeroPad(dstTokenAddress, 32),
            amountLD: amount,
            minAmountLD: amount, // TODO: add min amount
            extraOptions: options,
            composeMsg: '0x',
            oftCmd: '0x',
        }

        // get quote before send
        const messagingFee: MessagingFeeStruct = await srcToken.quoteSend(sendParams, false)
        // console.log('quote: \n nativeFee: ', messagingFee.nativeFee, '\n lzFee: ', messagingFee.lzTokenFee)

        // send
        const sendTx = await srcToken
            .connect(srcSigner)
            .send(sendParams, messagingFee, srcSigner.address, { value: messagingFee.nativeFee })
        await sendTx.wait()
        console.log(`Tx hash for sending tokens from chain A: ${sendTx.hash}`)
    }
}

async function main() {
    try {
        // fetch ABI, Bytecode
        const MyTokenJson = require('../../../artifacts/contracts/MyToken.sol/MyToken.json')

        // set params mostly from local files like env, etc.
        const bridgeConfig: BridgeConfig = {
            networkNames: ['Sepolia', 'Mumbai'],
            chainRpcUrls: [process.env.SEPOLIA_RPC_URL || '', process.env.MUMBAI_RPC_URL || ''],
            endpointIds: [process.env.SEPOLIA_ENDPOINT_V2_ID || '', process.env.MUMBAI_ENDPOINT_V2_ID || ''],
            endpointAddresses: [
                process.env.SEPOLIA_ENDPOINT_V2 || ZERO_ADDRESS,
                process.env.MUMBAI_ENDPOINT_V2 || ZERO_ADDRESS,
            ],
            tokenAddresses: [
                process.env.MY_LZ_TOKEN_SEPOLIA || ZERO_ADDRESS,
                process.env.MY_LZ_TOKEN_MUMBAI || ZERO_ADDRESS,
            ],
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
        // await TokenBridge.sendTokens(
        //     tokenBridge.tokens[0],
        //     tokenBridge.signers[0],
        //     BigNumber.from(String(1e18)), // 1 TSSC
        //     tokenBridge.endpointIds[1],
        //     tokenBridge.tokens[1].address
        // )
    } catch (error) {
        // console.error(`${error}`)
        throw new Error(`Panic: ${error}`)
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(`${error}`)
        process.exit(1)
    })
