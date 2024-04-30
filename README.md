# LayerZero Playground

## Description

This repo aims at playing around with the LayerZero available toolkits.

This project was created following:

```sh
npx create-lz-oapp@latest
```

## Install

> Make sure, `bun` is installed following this [guide](https://bun.sh/docs/installation).

```sh
bun install
```

## Build

```sh
bun run compile
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

## Demos

Visit [README](./demos/README.md).
