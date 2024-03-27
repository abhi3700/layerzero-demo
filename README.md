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

### OApp

#### Using Remix IDE

<details><summary>Details:</summary>

I have used Remix so far via:

```sh
remixd -s .
```

> Make sure, `remixd` is installed via `yarn global add @remix-project/remixd`.

The 2 txs are as follows:

1. Deploy `MyOApp` on Ethereum Sepolia testnet: [Tx url](https://sepolia.etherscan.io/tx/0xc9399c465bbaa846a11cfa08bb8a1d282e937d255d1748ef66442baf32201fca), [Details](./deployments/manual/1_to_src_chain.json).
2. Deploy `DesOApp` on Polygon Mumbai: [Tx url](https://mumbai.polygonscan.com/tx/0xb9e4bc9329fdca645b05a848a5f665e8efcbb437d3d1dc801c5acb8aa6496edc), [Details](./deployments/manual/2_to_des_chain.json).

</details>

#### Using Hardhat

Deployment could be done using foundry/hardhat as well. Personally, I would prefer foundry though.

```sh
npx hardhat lz:deploy
```

> Make sure to follow this [doc](https://docs.layerzero.network/contracts/deploying).

## Run

### OApp

TODO: write script like [this](./examples/lz-token/src/index.ts).

### OFT

Go to [examples/lz-token](./examples/lz-token/)

```sh
cd examples/lz-token

# Install the packages
yarn

# Run the script to send tokens TSSC tokens from chain A to B.
yarn start
```

The script is able to send tokens from chain A to B & viceversa. Also ignore deployments & setting peers, if already done.
