// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console2} from "forge-std/Script.sol";
import {MyOApp} from "../contracts/MyOApp.sol";

/* 
    $ source .env
    $ forge script script/MyOApp.s.sol:MyOAppScript --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY --broadcast --verify --verifier blockscout --verifier-url $VERIFIER_URL
*/
contract MyOAppScript is Script {
    string public srcChain = "Ethereum Sepolia";

    // Endpoint address for Ethereum Sepolia (as source chain)
    address srcEndpoint = 0x6EDCE65403992e310A62460808c4b910D972f10f;

    address public delegate;

    function setUp() public {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        delegate = vm.addr(privateKey);
    }

    function run() public {
        vm.startBroadcast();

        MyOApp myOApp = new MyOApp(srcEndpoint, delegate);
        console2.log("MyOApp SC deployed on ", srcChain, " at ", address(myOApp));

        vm.stopBroadcast();
    }
}
