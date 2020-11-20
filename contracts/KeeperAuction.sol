pragma solidity ^0.5.16;

import "./utils/SafeMath.sol";
import "./utils/Ownable.sol";
import "./ERC20Interface.sol";

contract KeeperAuction is Ownable {
    using SafeMath for uint256;
    using SafeMath for uint;

    enum BidType {MONTH_3, MONTH_6, MONTH_12}

    uint public constant DECIMALS = 8;
    uint public constant POWER_MONTH_3 = 10;
    uint public constant POWER_MONTH_6 = 15;
    uint public constant POWER_MONTH_12 = 20;
    uint256 public constant MIN_AMOUNT = 50000000;

    // timelock
    uint public constant MINIMUM_DELAY = 1 days;
    uint public constant MAXIMUM_DELAY = 5 days;

    struct Token {
        bool exist;
        address token;
        uint8 decimals;
    }

    struct Bid {
        address owner;
        bool live;
        BidType bidType;
        uint index;
        address token;
        uint256 amount;
        uint256 vAmount;
        uint256 selectdAmount;
    }

    struct UserBids {
        bool selected;
        uint256 amount;
        uint[] bids;
    }

    event Bidded(address indexed owner, BidType bidType, uint index, address indexed token, uint256 amount);
    event Canceled(address indexed owner, BidType bidType, uint index, address indexed token, uint256 amount);
    event Refund(address indexed owner, BidType bidType, uint index, address indexed token, uint256 amount);
    event CandidatesSeleted(address[] candidates, uint deadline);

    mapping(address => Token) public tokens;
    mapping(address => UserBids) public userBids;
    Bid[] public bids;
    address[] public bidders;
    uint public deadline;
    address[] public candidates;

    constructor(address[] memory _tokens) public {
        for (uint8 i = 0; i < _tokens.length; i++) {
            ERC20Interface token = ERC20Interface(_tokens[i]);
            uint8 decimals = token.decimals();
            require(decimals >= DECIMALS, "KeeperAuction::constructor: token decimal need greater default decimal");
            tokens[_tokens[i]] = Token(true, _tokens[i], decimals);
        }
    }

    function bid(BidType _type, address _token, uint256 _amount) public {
        require(candidates.length == 0, "KeeperAuction::bid: stop bid");

        Token memory vToken = tokens[_token];
        require(vToken.exist, "KeeperAuction::bid: Unknow token");

        uint256 vAmount = _amount;
        uint decimals = vToken.decimals;
        if (decimals > DECIMALS) {
            vAmount = _amount.div(10**(decimals - DECIMALS));
        }
        require(vAmount >= MIN_AMOUNT, "KeeperAuction::bid: too small amount");

        ERC20Interface token = ERC20Interface(_token);
        require(token.transferFrom(msg.sender, address(this), _amount), "KeeperAuction::bid: transferFrom fail");

        uint cIndex = bids.length;
        bids.push(Bid(msg.sender, true, _type, cIndex, _token, _amount, vAmount, 0));
        if (userBids[msg.sender].bids.length == 0) {
            bidders.push(msg.sender);
        }
        userBids[msg.sender].amount = userBids[msg.sender].amount.add(vAmount);
        userBids[msg.sender].bids.push(cIndex);
        emit Bidded(msg.sender, _type, cIndex, _token, _amount);
    }

    function cancel(uint _index) public {
        require(bids.length > _index, "KeeperAuction::cancel: Unknow bid index");
        Bid memory _bid = bids[_index];
        require(_bid.live, "KeeperAuction::cancel: Bid already canceled");
        require(msg.sender == _bid.owner, "KeeperAuction::cancel: Bid owner canceled");

        ERC20Interface token = ERC20Interface(_bid.token);
        require(token.transfer(msg.sender, _bid.amount), "KeeperAuction::cancel: Transfer back fail");
        bids[_index].live = false;
        userBids[msg.sender].amount = userBids[msg.sender].amount.sub(_bid.vAmount);
        emit Canceled(msg.sender, _bid.bidType, _bid.index, _bid.token, _bid.amount);
    }

    function refund() public {
        for (uint i = 0; i < userBids[msg.sender].bids.length; i++) {
            Bid memory _bid = bids[userBids[msg.sender].bids[i]];
            if (!_bid.live) {
                continue;
            }

            uint256 refundAmount = _bid.amount.sub(_bid.selectdAmount);
            if (refundAmount == 0) {
                continue;
            }
            ERC20Interface token = ERC20Interface(_bid.token);
            require(token.transfer(msg.sender, refundAmount), "KeeperAuction::refund: Transfer back fail");
            bids[_bid.index].live = false;
            emit Refund(msg.sender, _bid.bidType, _bid.index, _bid.token, refundAmount);
        }
    }

    function getBid(uint _index) public view returns (
        address owner,
        bool live,
        BidType bidType,
        uint index,
        address token,
        uint256 amount) {
        Bid memory _bid = bids[_index];
        return (
            _bid.owner,
            _bid.live,
            _bid.bidType,
            _bid.index,
            _bid.token,
            _bid.amount
        );
    }

    function bidderPower(address bidder) public view returns (uint256) {
        uint256 result = 0;
        for (uint i = 0; i < userBids[bidder].bids.length; i++) {
            Bid memory _bid = bids[userBids[bidder].bids[i]];
            if (!_bid.live) {
                continue;
            }
            uint256 power = _bid.amount;
            uint decimals = tokens[_bid.token].decimals;
            if (decimals > DECIMALS) {
                power = _bid.amount.div(10**(decimals - DECIMALS));
            }
            uint256 rate = 0;
            if (_bid.bidType == BidType.MONTH_3) {
                rate = POWER_MONTH_3;
            } else if (_bid.bidType == BidType.MONTH_6) {
                rate = POWER_MONTH_6;
            } else {
                rate = POWER_MONTH_12;
            }

            power = power.mul(rate);
            result = result.add(power);
        }
        return result;
    }

    function bidderAmount(address bidder) public view returns (uint256) {
        return userBids[bidder].amount;
    }

    function userBidsIndex(address bidder) public view returns (uint[] memory) {
        return userBids[bidder].bids;
    }

    function bidderCount() public view returns (uint) {
        return bidders.length;
    }

    // Owner oprations
    function selectCandidates(address[] memory _candidates, uint _deadline) public onlyOwner {
        require(getBlockTimestamp() <= _deadline.sub(MINIMUM_DELAY), "KeeperAuction::selectCandidates: deadline error");
        require(getBlockTimestamp() >= _deadline.sub(MAXIMUM_DELAY), "KeeperAuction::selectCandidates: deadline too large");

        candidates = _candidates;
        deadline = _deadline;
        emit CandidatesSeleted(_candidates, _deadline);
    }

    function end(address target, uint position) public onlyOwner {
        require(getBlockTimestamp() >= deadline, "KeeperAuction::end: can't end before deadline");
        require(position >= candidates.length, "KeeperAuction::end: position to large");

        UserBids[] memory result = new UserBids[](position);
        uint length = 0;
        for (uint i = 0; i < candidates.length; i++) {
            uint256 amount = bidderAmount(candidates[i]);
            if (amount == 0 || (length == position && result[length - 1].amount >= amount)) {
                continue;
            }

            UserBids memory item = userBids[candidates[i]];
            if (length < position) {
                result[length] = item;
                length++;
            } else {
                result[length - 1] = item;
            }
            for (uint k = length - 1; k > 0; k--) {
                if (result[k - 1].amount < result[k].amount) {
                    UserBids memory temp = result[k];
                    result[k] = result[k - 1];
                    result[k - 1] = temp;
                } else {
                    break;
                }
            }
        }

        require(position == length, "KeeperAuction::end: Insufficient seats");
        // TODO
    }

    function getBlockTimestamp() public view returns (uint) {
        // solium-disable-next-line security/no-block-members
        return block.timestamp;
    }
}
