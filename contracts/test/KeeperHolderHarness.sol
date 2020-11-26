pragma solidity ^0.5.16;

interface ERC20 {
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);
    function totalSupply() external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract KeeperHolderHarness {
    address[] public keepers;

    function add(address[] memory _tokens, uint256[] memory _amount, address[] memory _keepers) public returns (bool) {
        require(_tokens.length == _amount.length, "KeeperHolderHarness:add: dismatch tokens and amount");
        for(uint i = 0; i < _tokens.length; i++) {
            if (_amount[i] == 0) {
                continue;
            }
            ERC20 token = ERC20(_tokens[i]);
            require(token.transferFrom(msg.sender, address(this), _amount[i]), "KeeperHolderHarness:add: transferFrom fail");
        }
        keepers = _keepers;
        return true;
    }

    function keeperSize() public view returns (uint) {
        return keepers.length;
    }
}