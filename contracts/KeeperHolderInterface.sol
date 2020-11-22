pragma solidity ^0.5.16;

interface KeeperHolderInterface {
    function add(address[] calldata tokens, uint256[] calldata amount, address[] calldata keepers) external returns (bool success);
}
