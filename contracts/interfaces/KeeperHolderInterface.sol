// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface KeeperHolderInterface {
    function add(address[] calldata tokens, uint256[] calldata amount, address[] calldata keepers) external returns (bool success);
}
