pragma solidity ^0.5.16;

import "./utils/SafeMath.sol";
import "./utils/Ownable.sol";
import "./ERC20Interface.sol";

contract KeeperAuction is Ownable {
    using SafeMath for uint256;

    enum BidType {MONTH_3, MONTH_6, MONTH_12}

    uint public constant DECIMALS = 8;
    uint public constant POWER_MONTH_3 = 10;
    uint public constant POWER_MONTH_6 = 15;
    uint public constant POWER_MONTH_12 = 20;
    uint public constant POSITION = 30;

    struct Token {
        bool exist;
        address token;
        uint8 decimals;
    }

    struct Bid {
        address owner;
        bool live;
        bool selected;
        BidType bidType;
        uint index;
        address token;
        uint256 amount;
        uint256 power;
    }

    struct UserBids {
        uint256 power;
        uint[] bids;
    }

    event Bidded(address indexed owner, BidType bidType, uint index, address indexed token, uint256 amount, uint256 power);

    mapping(address => Token) public tokens;
    mapping(address => UserBids) public userBids;
    Bid[] public bids;
    address[] public bidders;

    constructor(address[] memory _tokens) public {
        for (uint8 i = 0; i < _tokens.length; i++) {
            ERC20Interface token = ERC20Interface(_tokens[i]);
            uint8 decimals = token.decimals();
            require(decimals >= DECIMALS, "KeeperAuction::constructor: token decimal need greater default decimal");
            tokens[_tokens[i]] = Token(true, _tokens[i], decimals);
        }
    }

    function bid(BidType _type, address _token, uint256 _amount) public {
        require(tokens[_token].exist, "KeeperAuction::bid: Unknow token");
        ERC20Interface token = ERC20Interface(_token);
        require(token.transferFrom(msg.sender, address(this), _amount), "KeeperAuction::bid: transferFrom fail");

        uint cIndex = bids.length;
        uint256 power = _amount;
        uint decimals = token.decimals();
        if (decimals > DECIMALS) {
            power = _amount.div(10**(decimals - DECIMALS));
        }
        uint256 rate = 0;
        if (_type == BidType.MONTH_3) {
            rate = POWER_MONTH_3;
        } else if (_type == BidType.MONTH_6) {
            rate = POWER_MONTH_6;
        } else {
            rate = POWER_MONTH_12;
        }

        power = power.mul(rate);
        bids.push(Bid(msg.sender, true, false, _type, cIndex, _token, _amount, power));
        if (userBids[msg.sender].bids.length == 0) {
            bidders.push(msg.sender);
        }
        userBids[msg.sender].bids.push(cIndex);
        userBids[msg.sender].power = userBids[msg.sender].power.add(power);
        emit Bidded(msg.sender, _type, cIndex, _token, _amount, power);
    }

    function cancel(uint _index) public {
        // TODO
    }

    function bidderPower(address keeper) public view returns (uint256) {
        return userBids[keeper].power;
    }

    function bidderCount() public view returns (uint) {
        return bidders.length;
    }
}
