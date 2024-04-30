# Demos

## Description

This aims at demonstrating the usage of the LayerZero OApp/OFT with some customization.

## Install

```sh
bun install
```

## Build

```sh
bun run build
```

## Demos

In order to run demos,

### A. Send token between any EVM chains

```sh
bun lz-token
```

The script is able to send tokens from chain A to B & viceversa. Also ignore deployments & setting peers, if already done.

Currently, when tokens are transferred from chain A to B, the token-B receives the token.

<details><summary>Details:</summary>

```sh
Address '0x0370...d246' with token-[0] has balance: 999994.0
Address '0x0370...d246' with token-[1] has balance: 999997.0
Address '0xcd17...76ba' with token-[0] has balance: 3.0
Address '0xcd17...76ba' with token-[1] has balance: 0.0
Address '0x5c91...59cD' with token-[0] has balance: 0.0
Address '0x5c91...59cD' with token-[1] has balance: 6.0
```

As you can see that 3 addresses (1 EOA, 2 contracts) have balances of the 2 tokens. Cumulatively, on either chain total supply is 1 M, total 2 M.

</details>

### B. Subspace's Auto Bridge

1. For demo, run in terminal-1:

```sh
# set peers (required only once)
bun auto-bridge:demo init

# view balances
bun auto-bridge:demo view

# deposit TSSC & send wTSSC
bun auto-bridge:demo send
```

2. To host offchain layer (handling DVN, Executor roles), run in terminal-2:

```sh
bun auto-bridge:dvn
```

> This keeps running and listens to messages sent over src chain from terminal-1.
