// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {console2} from "forge-std/Test.sol";
import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {WTsscLz} from "../../contracts/WTsscLz.sol";
import {Utils} from "./Utils.sol";

contract WTsscLzTest is TestHelperOz5 {
    uint32 aEid = 1;
    uint32 bEid = 2;
    uint32 cEid = 3;

    address alice = address(0x01);
    address bob = address(0x02);
    address charlie = address(0x03);

    WTsscLz public aWTssc;
    WTsscLz public bWTssc;
    WTsscLz public cWTssc;

    function setUp() public override {
        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
        vm.deal(charlie, 1000 ether);

        setUpEndpoints(3, LibraryType.UltraLightNode);

        // Deploy contracts
        aWTssc = new WTsscLz("Subspace Wrapped TSSC Chain A", "aWTSSC", endpoints[aEid], address(this));
        bWTssc = new WTsscLz("Subspace Wrapped TSSC Chain B", "bWTSSC", endpoints[bEid], address(this));
        cWTssc = new WTsscLz("Subspace Wrapped TSSC Chain C", "cWTSSC", endpoints[cEid], address(this));

        // set peers
        aWTssc.setPeer(bEid, Utils.address_to_bytes32(address(bWTssc)));
        aWTssc.setPeer(cEid, Utils.address_to_bytes32(address(cWTssc)));
        bWTssc.setPeer(aEid, Utils.address_to_bytes32(address(aWTssc)));
        bWTssc.setPeer(cEid, Utils.address_to_bytes32(address(cWTssc)));
        cWTssc.setPeer(aEid, Utils.address_to_bytes32(address(aWTssc)));
        cWTssc.setPeer(bEid, Utils.address_to_bytes32(address(bWTssc)));
    }

    function test_constructor() public {
        // token name
        assertEq(aWTssc.name(), "Subspace Wrapped TSSC Chain A");
        assertEq(bWTssc.name(), "Subspace Wrapped TSSC Chain B");
        assertEq(cWTssc.name(), "Subspace Wrapped TSSC Chain C");

        // token symbol
        assertEq(aWTssc.symbol(), "aWTSSC");
        assertEq(bWTssc.symbol(), "bWTSSC");
        assertEq(cWTssc.symbol(), "cWTSSC");

        // token decimals
        assertEq(aWTssc.decimals(), 18);
        assertEq(bWTssc.decimals(), 18);
        assertEq(cWTssc.decimals(), 18);

        // token owner
        assertEq(aWTssc.owner(), address(this));
        assertEq(bWTssc.owner(), address(this));
        assertEq(cWTssc.owner(), address(this));

        // check total supply is zero
        assertEq(aWTssc.totalSupply(), 0);
        assertEq(bWTssc.totalSupply(), 0);
        assertEq(cWTssc.totalSupply(), 0);
    }

    function test_peers_correctly_set() public view {
        assert(aWTssc.isPeer(bEid, Utils.address_to_bytes32(address(bWTssc))));
        assert(aWTssc.isPeer(cEid, Utils.address_to_bytes32(address(cWTssc))));
        assert(bWTssc.isPeer(aEid, Utils.address_to_bytes32(address(aWTssc))));
        assert(bWTssc.isPeer(cEid, Utils.address_to_bytes32(address(cWTssc))));
        assert(cWTssc.isPeer(aEid, Utils.address_to_bytes32(address(aWTssc))));
        assert(cWTssc.isPeer(bEid, Utils.address_to_bytes32(address(bWTssc))));
    }

    function test_deposit_token_works() public {
        vm.prank(alice);
        // alice deposit 10 TSSC to WTsscLz
        aWTssc.deposit{value: 1 ether}();
        // check alice's balance is 10 aWTSSC
        assertEq(aWTssc.balanceOf(alice), 1 ether);
    }

    function test_withdraw_token_works() public {
        vm.startPrank(alice);
        aWTssc.deposit{value: 1 ether}();

        aWTssc.withdraw(0.75 ether);
        assertEq(aWTssc.balanceOf(alice), 0.25 ether);
    }
}
