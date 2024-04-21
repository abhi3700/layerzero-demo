import { Wallet, BigNumber, Contract, BigNumberish } from 'ethers'
import { TokenBridge } from '../tokenbridge'
import { BridgeConfig } from '../types'
// import { assert } from 'chai'
import { expect } from 'bun:test'

export class WrappedTokenBridge extends TokenBridge {
    constructor(config: BridgeConfig, tokenName: string, tokenSymbol: string) {
        super(config, tokenName, tokenSymbol)
    }

    /// send tokens from token A to B on 2 different chains
    public static async sendTssc(
        srcToken: Contract,
        srcSigner: Wallet,
        amount: BigNumber,
        dstEid: BigNumberish,
        recipientAddress: string
    ): Promise<void> {
        let currentBalance = await srcToken.balanceOf(srcSigner.address)

        // call deposit function first if insufficient i.e. amount > current WTSSC balance
        if (amount > currentBalance) {
            const amountToDeposit = amount.sub(currentBalance)
            const tx = await srcToken.connect(srcSigner).deposit({ value: amountToDeposit, gasLimit: 8000000 })
            const receipt = await tx.wait()
            console.log(`Deposited ${amountToDeposit} via tx hash: ${tx.hash} in block #${receipt.blockNumber}`)
        }

        currentBalance = await srcToken.balanceOf(srcSigner.address)
        // assert(amount.lte(currentBalance), "Insufficient WTSSC in sender's balance")
        expect(amount.lte(currentBalance)).toBe(true)

        // FIXME: debug this when enabled.
        super.sendTokens(srcToken, srcSigner, amount, dstEid, recipientAddress)
    }
}
