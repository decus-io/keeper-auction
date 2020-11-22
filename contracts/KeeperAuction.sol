pragma solidity ^0.5.16;

import "./utils/SafeMath.sol";
import "./utils/Ownable.sol";
import "./ERC20Interface.sol";
import "./KeeperHolderInterface.sol";

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
        uint index;
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
        address holder;
        uint256 amount;
        uint[] bids;
    }

    struct SelectedToken {
        address token;
        uint256 amount;
    }

    event Bidded(address indexed owner, BidType bidType, uint index, address indexed token, uint256 amount);
    event Canceled(address indexed owner, BidType bidType, uint index, address indexed token, uint256 amount);
    event Refund(address indexed owner, BidType bidType, uint index, address indexed token, uint256 amount);
    event CandidatesSeleted(address[] candidates, uint deadline);
    event AuctionEnd(address[] tokens, uint256[] amount, address[] keepers);

    mapping(address => Token) public tokens;
    mapping(address => UserBids) public userBids;
    Bid[] public bids;
    address[] public bidders;
    uint public deadline;
    address[] public candidates;
    SelectedToken[] public selectedTokens;

    constructor(address[] memory _tokens) public {
        for (uint8 i = 0; i < _tokens.length; i++) {
            ERC20Interface token = ERC20Interface(_tokens[i]);
            uint8 decimals = token.decimals();
            require(decimals >= DECIMALS, "KeeperAuction::constructor: token decimal need greater default decimal");
            tokens[_tokens[i]] = Token(true, _tokens[i], decimals, i);
            selectedTokens.push(SelectedToken(_tokens[i], 0));
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
        userBids[msg.sender].holder = msg.sender;
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
        uint256 cancelAmount = _bid.amount.sub(_bid.selectdAmount);
        require(cancelAmount > 0, "KeeperAuction::cancel: zero amount");
        require(token.transfer(msg.sender, cancelAmount), "KeeperAuction::cancel: Transfer back fail");
        bids[_index].live = false;
        userBids[msg.sender].amount = userBids[msg.sender].amount.sub(_bid.vAmount);
        emit Canceled(msg.sender, _bid.bidType, _bid.index, _bid.token, cancelAmount);
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

    function biddable() public view returns (bool) {
        return candidates.length == 0;
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
        address[] memory keepers = new address[](position);
        uint256 min = result[position - 1].amount;
        for (uint i = 0; i < result.length; i++) {
            keepers[i] = result[i].holder;
            uint256 selectedAmount = 0;
            for (uint j = 0; j < result[i].bids.length; j++) {
                Bid memory item = bids[result[i].bids[j]];
                if (!item.live) {
                    continue;
                }
                Token memory token = tokens[item.token];
                uint256 itemAmount = 0;
                if (item.vAmount > min.sub(selectedAmount)) {
                    selectedAmount = min;
                    itemAmount = min.sub(selectedAmount);
                } else {
                    selectedAmount = selectedAmount.add(item.vAmount);
                    itemAmount = item.vAmount;
                }
                bids[result[i].bids[j]].selectdAmount = selectedAmount;
                if (token.decimals > DECIMALS) {
                    bids[result[i].bids[j]].selectdAmount = selectedAmount.mul(10**(token.decimals - DECIMALS));
                }
                selectedTokens[token.index].amount = selectedTokens[token.index].amount.add(bids[result[i].bids[j]].selectdAmount);

                if (selectedAmount == min) {
                    break;
                }
            }
        }

        address[] memory _tokens = new address[](selectedTokens.length);
        uint256[] memory _amounts = new uint256[](selectedTokens.length);
        for(uint i = 0; i < selectedTokens.length; i++) {
            ERC20Interface token = ERC20Interface(selectedTokens[i].token);
            _tokens[i] = selectedTokens[i].token;
            _amounts[i] = selectedTokens[i].amount;
            require(token.approve(target, selectedTokens[i].amount), "KeeperAuction::end: approve fail");
        }
        KeeperHolderInterface holder = KeeperHolderInterface(target);
        require(holder.add(_tokens, _amounts, keepers),  "KeeperAuction::end: add keepers fail");
        emit AuctionEnd(_tokens, _amounts, keepers);
    }

    function getBlockTimestamp() public view returns (uint) {
        // solium-disable-next-line security/no-block-members
        return block.timestamp;
    }
}
