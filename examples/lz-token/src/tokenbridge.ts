import { Contract, ethers, BigNumber, ContractFactory, BigNumberish } from 'ethers'
import { SendParamStruct, MessagingFeeStruct } from './typechain/contracts/MyToken'
import { Options } from '@layerzerolabs/lz-v2-utilities'
import { hexZeroPad } from 'ethers/lib/utils'

/* Constants */
// TODO: define max. chains
// const N: number = 2;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// params loaded from some file(s) like `.env`
export interface BridgeConfig {
    networkNames: string[]
    chainRpcUrls: string[]
    endpointIds: string[]
    endpointAddresses: string[]
    tokenAddresses: string[]
    privateKey: string
    abi: any
    bytecode: string
}

export class TokenBridge {
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
                    `Token-${i} deployed at address: ${tokenContract.address} with tx hash: ${tokenContract.deployTransaction.hash}
                    NOTE: manually, copy this address to your .env file for next runs.`
                )

                // set the new token contract into corresponding index of the array
                this.tokens[i] = tokenContract
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
            console.log(`Incorrect/No peer was set on ${networkName}.`)
            const tx = await tokenContract.connect(owner).setPeer(othersEndpointId, paddedPeerAddress)
            await tx.wait()
            console.log(`\tSo, correct peer set on ${networkName} via tx hash: ${tx.hash}`)
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

    /// Get balances of an address on both the chains
    public async getBalancesOf(whoAddress: string): Promise<BigNumber[]> {
        const balances = []
        for (let i = 0; i < 2; ++i) {
            const balOwner = await this.tokens[i].balanceOf(whoAddress)
            console.log(
                `Address \'${whoAddress.slice(0, 6)}...${whoAddress.slice(-4)}\' with token-[${i}] has balance: ${ethers.utils.formatEther(balOwner)}`
            )
            balances.push(balOwner)
        }

        return balances
    }

    /// Get the total supply of tokens on both the chains
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
        recipientAddress: string
    ): Promise<void> {
        // TODO: add gas limit as param by fetching from the network on real-time
        const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString()
        const sendParams: SendParamStruct = {
            dstEid,
            to: ethers.utils.hexZeroPad(recipientAddress, 32),
            amountLD: amount,
            minAmountLD: amount, // TODO: try with some min. amount instead of same as amount
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
        console.log(
            `Tx hash for sending tokens from contract \'${srcToken.address.slice(0, 6)}...${srcToken.address.slice(-4)}\': \n\t\'${sendTx.hash}\'`
        )
    }
}
