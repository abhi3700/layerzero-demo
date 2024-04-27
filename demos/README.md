# Typescript Boilerplate

## Description

This aims at demonstrating the usage of the LayerZero OApp/OFT with some customization.

## Install

> Prerequisite:

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

### B. Subspace's Auto Bridge

1. To send token, run in terminal-1:

```sh
bun auto-bridge: view
```

2. To host offchain layer (handling DVN, Executor roles), run in terminal-2:

```sh
bun auto-bridge:dvn
```

> This keeps running and listens to messages sent over src chain from terminal-1.
