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
