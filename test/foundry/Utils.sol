// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

library Utils {
    function address_to_bytes32(address addr) public pure returns (bytes32) {
        return bytes32(uint256(uint160(address(addr))) << 96);
    }
}
