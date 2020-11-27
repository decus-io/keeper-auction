// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract KeeperHolderHarness {
    address[] public keepers;

    function add(address[] memory _tokens, uint256[] memory _amount, address[] memory _keepers) public returns (bool) {
        require(_tokens.length == _amount.length, "KeeperHolderHarness:add: dismatch tokens and amount");
        for(uint i = 0; i < _tokens.length; i++) {
            if (_amount[i] == 0) {
                continue;
            }
            IERC20 token = IERC20(_tokens[i]);
            require(token.transferFrom(msg.sender, address(this), _amount[i]), "KeeperHolderHarness:add: transferFrom fail");
        }
        keepers = _keepers;
        return true;
    }

    function keeperSize() public view returns (uint) {
        return keepers.length;
    }
}