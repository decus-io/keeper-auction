const {
    mineBlock,
    etherUnsigned
} = require('./utils/Ethereum');

const {
    timeout
} = require('./utils/Time');

const ERC20Mock = artifacts.require("ERC20Mock");
const KeeperHolderHarness = artifacts.require("KeeperHolderHarness");
const KeeperAuction = artifacts.require("KeeperAuction");

contract("KeeperAuction", accounts => {
    let owner;
    let holder;
    let unbid;
    let keeper1;
    let keeper2;
    let keeper3;
    let hBTC;
    let wBTC;
    let auction;
    let keeperHolder;

    beforeEach(async () => {
        [owner, holder, unbid, keeper1, keeper2, keeper3] = accounts;
        hBTC = await ERC20Mock.new('Huobi Bitcoin', 'HBTC', 18, etherUnsigned(100000000000000000000),  {from: holder});
        wBTC = await ERC20Mock.new('Wrapped Bitcoin', 'WBTC', 8, 10000000000,  {from: holder});
        auction = await KeeperAuction.new([hBTC.address, wBTC.address], 1, {from: owner});
        keeperHolder = await KeeperHolderHarness.new([hBTC.address, wBTC.address]);
    });

    describe('end', () => {
        it('check gas', async () => {
            await wBTC.transfer(keeper1, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(keeper2, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(keeper3, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(unbid, etherUnsigned("1000000000"), {from: holder});

            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper1});
            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper2});
            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper3});

            await hBTC.transfer(keeper1, etherUnsigned("10000000000000000000"), {from: holder});
            await hBTC.transfer(keeper2, etherUnsigned("1000000000000000000"), {from: holder});
            await hBTC.transfer(keeper3, etherUnsigned("1000000000000000000"), {from: holder});
            await hBTC.transfer(unbid, etherUnsigned("1000000000000000000"), {from: holder});

            await hBTC.approve(auction.address, etherUnsigned("10000000000000000000"), {from: keeper1});
            await hBTC.approve(auction.address, etherUnsigned("1000000000000000000"), {from: keeper2});
            await hBTC.approve(auction.address, etherUnsigned("1000000000000000000"), {from: keeper3});

            await auction.bid(wBTC.address, etherUnsigned("50000000"), {from: keeper1});
            await auction.bid(hBTC.address, etherUnsigned("2500000000000123456"), {from: keeper1});
            await auction.bid(wBTC.address, etherUnsigned("150000000"), {from: keeper2});
            await auction.bid(wBTC.address, etherUnsigned("50000000"), {from: keeper2});
            await auction.bid(wBTC.address, etherUnsigned("150000000"), {from: keeper3});
            await auction.bid(hBTC.address, etherUnsigned("700033000000000000"), {from: keeper3});

            let biddable = await auction.biddable();
            expect(biddable).equals(true);

            const blockTimestamp = etherUnsigned(await auction.getBlockTimestamp());
            const deadline = blockTimestamp.plus(2);

            await auction.lockEnd(keeperHolder.address, deadline);

            const keeper1Bids = await auction.userBids(keeper1);
            expect(keeper1Bids.amount.toString()).equals("300000000");
            const keeper2Bids = await auction.userBids(keeper2);
            expect(keeper2Bids.amount.toString()).equals("200000000");
            const keeper3Bids = await auction.userBids(keeper3);
            expect(keeper3Bids.amount.toString()).equals("220003300");

            await timeout(2100);
            await mineBlock();

            let wBTCBalance = await wBTC.balanceOf(auction.address);
            expect(wBTCBalance.toString()).equals("400000000");

            let hBTCBalance = await hBTC.balanceOf(auction.address);
            expect(hBTCBalance.toString()).equals("3200033000000123456");

            const initial = await web3.eth.getBalance(accounts[1]);
            console.log(`Initial: ${initial.toString()}`);

            const receipt = await auction.end([keeper1, keeper2, keeper3], {from: owner});
            const gasUsed = receipt.receipt.gasUsed;
            console.log(`GasUsed: ${receipt.receipt.gasUsed}`);

            wBTCBalance = await wBTC.balanceOf(auction.address);
            expect(wBTCBalance.toString()).equals("0");
            hBTCBalance = await hBTC.balanceOf(auction.address);
            expect(hBTCBalance.toString()).equals("1200033000000123456");

            wBTCBalance = await wBTC.balanceOf(keeperHolder.address);
            expect(wBTCBalance.toString()).equals("400000000");
            hBTCBalance = await hBTC.balanceOf(keeperHolder.address);
            expect(hBTCBalance.toString()).equals("2000000000000000000");

            await auction.refund({from: keeper1});
            await auction.refund({from: keeper2});
            await auction.refund({from: keeper3});

            wBTCBalance = await wBTC.balanceOf(auction.address);
            expect(wBTCBalance.toString()).equals("0");
            hBTCBalance = await hBTC.balanceOf(auction.address);
            expect(hBTCBalance.toString()).equals("0");

            let keeper1Balance = await wBTC.balanceOf(keeper1);
            expect(keeper1Balance.toString()).equals("950000000");
            keeper1Balance = await hBTC.balanceOf(keeper1);
            expect(keeper1Balance.toString()).equals("8500000000000000000");

            let keeper2Balance = await wBTC.balanceOf(keeper2);
            expect(keeper2Balance.toString()).equals("800000000");
            keeper2Balance = await hBTC.balanceOf(keeper2);
            expect(keeper2Balance.toString()).equals("1000000000000000000");

            let keeper3Balance = await wBTC.balanceOf(keeper3);
            expect(keeper3Balance.toString()).equals("850000000");
            keeper3Balance = await hBTC.balanceOf(keeper3);
            expect(keeper3Balance.toString()).equals("500000000000000000");
        });
    });
});
