# LayerZero OApp Demo

## Description

This aims at showcasing the cross-chain txs from one chain to another.

This project is created following:

```sh
npx create-lz-oapp@latest
```

For the whole project, chain-1 is Sepolia Testnet, chain-2 is Polygon Mumbai.

Both the contracts are OApps so far. Later on, we would also focus on OFT.

## Install

```sh
yarn
```

## Build

```sh
yarn compile
```

## Deploy

I have used Remix so far via:

```sh
remixd -s .
```

> Make sure, `remixd` is installed via `yarn global add @remix-project/remixd`.

The 2 txs are as follows:

1. Deploy `MyOApp` on Ethereum Sepolia testnet: [Tx url](https://sepolia.etherscan.io/tx/0xc9399c465bbaa846a11cfa08bb8a1d282e937d255d1748ef66442baf32201fca), [Details](./deployments/1_to_src_chain.json).
2. Deploy `DesOApp` on Polygon Mumbai: [Tx url](https://mumbai.polygonscan.com/tx/0xb9e4bc9329fdca645b05a848a5f665e8efcbb437d3d1dc801c5acb8aa6496edc), [Details](./deployments/2_to_des_chain.json).

Deployment could be done using foundry/hardhat as well. Personally, I would prefer foundry though.

## Run 🚧

<details>
<summary>Tutorial-1: Send message</summary>

> After deployment of the respective OApp contracts on the source and destination chains respectively.

1. `DesOApp::setPeer` (on Mumbai): Owner set peer in the OApp on the destination chain (say Polygon Mumbai). [Tx url](https://mumbai.polygonscan.com/tx/0xddbe10afe2fbeee4cd70efdbdc26a5f92d1d44827c1a65832aa5557b39e3c615).

  ```
  eid : 40161
  peer : 0xc81dcb9afa23cb8483f31b0252a00c93cfc5ac9e000000000000000000000000
  ```

  > peer is the contract address of `MyOApp` (on the chain-1).

2. Now, need to get fee estimate/quote by the calling `MyOApp::quote` (on Sepolia) before sending message/tx via `MyOApp::send`.

  Input:

  ```
  _dstEid : 40109
  _message : "Abhijit is a good boy"
  _options : 0x00030100110100000000000000000000000000030d40
  _payInLzToken : false
  ```

  > `0x00030100110100000000000000000000000000030d40` taken from [Estimating fees](https://docs.layerzero.network/contracts/getting-started#estimating-fees) section.

  2 attempts made because of the requirement of 2 trials:

  ```
  (nativeFee, lzTokenFee)
  (uint256,uint256): fee 

  64824974813856,0
  64881403746362,0
  ```

3. `MyOApp::send` (on Sepolia): Send message to Mumbai testnet with native fee.
  Attempts:
   a. [Tx url](https://sepolia.etherscan.io/tx/0xbd40578f79efda941d381fa33e70261b960af1b8c9e5a9b673e44a5a7a82c7be)
   b. [Tx url](https://sepolia.etherscan.io/tx/0x408b6b21e0138559f4a25cb961adf5894e4c892ec69a3da023a4b94a0876374e)

  Input:

  msg.value (in wei): 64824974813856

  ```

  _dstEid : 40109
  _message : "Abhijit is a good boy"
  _options : 0x00030100110100000000000000000000000000030d40

  ```

  Here, the gas fees is paid to:

- source,
- destination,
- Security Stack & Executor, who authenticate and deliver the messages.

4. Check the `data` field of `DestOApp` on Mumbai. If not delivered, track on [LayerZero testnet](https://testnet.layerzeroscan.com/) by tx hash.

> Sometimes, may be due to destination network delay, the message might take long to get delivered.

</details>
