const {
    etherUnsigned
} = require('./utils/Ethereum');

const {
    timeout
} = require('./utils/Time');

const StandardToken = artifacts.require("StandardToken");
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

    beforeEach(async () => {
        [owner, holder, unbid, keeper1, keeper2, keeper3] = accounts;
        hBTC = await StandardToken.new(etherUnsigned(100000000000000000000), 'Huobi Bitcoin', 18, 'HBTC', {from: holder});
        wBTC = await StandardToken.new(10000000000, 'Wrapped Bitcoin', 8, 'HBTC', {from: holder});
        auction = await KeeperAuction.new([hBTC.address, wBTC.address], 10, {from: owner});
    });

    describe('bid', () => {
        it('insufficient allowance', async () => {
            try {
                await auction.bid(0, hBTC.address, etherUnsigned(1000000000000000000));
            } catch (e) {
                expect(e.reason).equals("Insufficient allowance");
            }
        });

        it('bid 100000000000000000 for small amount', async () => {
            try {
                await hBTC.approve(auction.address, etherUnsigned("100000000001234567"), {from: holder});
                await auction.bid(0, hBTC.address, etherUnsigned("100000000001234567"), {from: holder});
            } catch (e) {
                expect(e.reason).equals("KeeperAuction::bid: too small amount");
            }
        });
        
        it('bid 1000000000000000000 hbtc with 3 month', async () => {
            await hBTC.approve(auction.address, etherUnsigned("1000000000001234567"), {from: holder});

            let hBTCBalance = await hBTC.balanceOf(auction.address);
            expect(hBTCBalance.toString()).equals("0");

            await auction.bid(0, hBTC.address, etherUnsigned("1000000000001234567"), {from: holder});

            hBTCBalance = await hBTC.balanceOf(auction.address);
            expect(hBTCBalance.toString()).equals("1000000000001234567");
        });

        it('bid multipul', async () => {
            let power = await auction.bidderPower(holder);
            expect(power.toString()).equals("0");

            await hBTC.approve(auction.address, etherUnsigned("4000000000000000000"), {from: holder});
            await wBTC.approve(auction.address, etherUnsigned("200000000"), {from: holder});

            let hBTCBalance = await hBTC.balanceOf(auction.address);
            expect(hBTCBalance.toString()).equals("0");

            await auction.bid(0, hBTC.address, etherUnsigned("1000000000001234567"), {from: holder});
            await auction.bid(1, hBTC.address, etherUnsigned("1000000000000000000"), {from: holder});
            await auction.bid(2, hBTC.address, etherUnsigned("1000000000000000000"), {from: holder});
            await auction.bid(2, wBTC.address, etherUnsigned("200000000"), {from: holder});

            hBTCBalance = await hBTC.balanceOf(auction.address);
            power = await auction.bidderPower(holder);
            expect(power.toString()).equals("8500000000");
            expect(hBTCBalance.toString()).equals("3000000000001234567");

            const wBTCBalance = await wBTC.balanceOf(auction.address);
            expect(wBTCBalance.toString()).equals("200000000");

            const bidderCount = await auction.bidderCount();
            expect(bidderCount.toString()).equals("1");
        });
    });

    describe('cancel', () => {
        it('cancel one', async () => {
            await wBTC.transfer(keeper1, etherUnsigned("100000000"), {from: holder});
            await wBTC.transfer(keeper2, etherUnsigned("200000000"), {from: holder});

            await wBTC.approve(auction.address, etherUnsigned("100000000"), {from: keeper1});
            await wBTC.approve(auction.address, etherUnsigned("200000000"), {from: keeper2});

            let keep1Balance = await wBTC.balanceOf(keeper1);
            expect(keep1Balance.toString()).equals("100000000");

            let wBTCBalance = await wBTC.balanceOf(auction.address);
            expect(wBTCBalance.toString()).equals("0");

            await auction.bid(0, wBTC.address, etherUnsigned("100000000"), {from: keeper1});

            keep1Balance = await wBTC.balanceOf(keeper1);
            expect(keep1Balance.toString()).equals("0");
            
            let keeper1Power = await auction.bidderPower(keeper1);
            expect(keeper1Power.toString()).equals("1000000000");

            wBTCBalance = await wBTC.balanceOf(auction.address);
            expect(wBTCBalance.toString()).equals("100000000");

            let bid0 = await auction.getBid(0);
            const bidCount = await auction.bidCount();
            expect(bidCount.toString()).equals("1");
            expect(bid0.owner).equals(keeper1);
            expect(bid0.live).equals(true);

            try {
                await auction.cancel(0, {from: keeper2});
            } catch (e) {
                expect(e.reason).equals("KeeperAuction::cancel: Only owner can cancel");
            }
            let keep2Balance = await wBTC.balanceOf(keeper2);
            expect(keep2Balance.toString()).equals("200000000");

            wBTCBalance = await wBTC.balanceOf(auction.address);
            expect(wBTCBalance.toString()).equals("100000000");

            await auction.cancel(0, {from: keeper1});

            keeper1Power = await auction.bidderPower(keeper1);
            expect(keeper1Power.toString()).equals("0");

            keep1Balance = await wBTC.balanceOf(keeper1);
            expect(keep1Balance.toString()).equals("100000000");
            bid0 = await auction.getBid(0);
            expect(bid0.owner).equals(keeper1);
            expect(bid0.live).equals(false);
        });

        it('cancel and refund', async () => {
            await wBTC.transfer(keeper1, etherUnsigned("100000000"), {from: holder});
            await wBTC.transfer(keeper2, etherUnsigned("200000000"), {from: holder});

            await wBTC.approve(auction.address, etherUnsigned("100000000"), {from: keeper1});
            await wBTC.approve(auction.address, etherUnsigned("200000000"), {from: keeper2});

            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper1});
            await auction.bid(0, wBTC.address, etherUnsigned("150000000"), {from: keeper2});
            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper2});
            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper1});

            let keep1Balance = await wBTC.balanceOf(keeper1);
            expect(keep1Balance.toString()).equals("0");
            let keep2Balance = await wBTC.balanceOf(keeper2);
            expect(keep2Balance.toString()).equals("0");

            const bidCount = await auction.bidCount();
            expect(bidCount.toString()).equals("4");

            let wBTCBalance = await wBTC.balanceOf(auction.address);
            expect(wBTCBalance.toString()).equals("300000000");

            let keeper1Power = await auction.bidderPower(keeper1);
            expect(keeper1Power.toString()).equals("1000000000");

            await auction.cancel(0, {from: keeper1});

            wBTCBalance = await wBTC.balanceOf(auction.address);
            expect(wBTCBalance.toString()).equals("250000000");

            keep1Balance = await wBTC.balanceOf(keeper1);
            expect(keep1Balance.toString()).equals("50000000");

            await auction.refund({from: keeper1});

            wBTCBalance = await wBTC.balanceOf(auction.address);
            expect(wBTCBalance.toString()).equals("200000000");

            keep1Balance = await wBTC.balanceOf(keeper1);
            expect(keep1Balance.toString()).equals("100000000");

            keeper1Power = await auction.bidderPower(keeper1);
            expect(keeper1Power.toString()).equals("0");

            await auction.refund({from: keeper2});

            wBTCBalance = await wBTC.balanceOf(auction.address);
            expect(wBTCBalance.toString()).equals("0");

            keeper2Power = await auction.bidderPower(keeper2);
            expect(keeper2Power.toString()).equals("0");

            keep2Balance = await wBTC.balanceOf(keeper2);
            expect(keep2Balance.toString()).equals("200000000");
        });
    });

    describe('all in one', async () => {
        it('check owner', async () => {
            let biddable = await auction.biddable();
            expect(biddable).equals(true);

            const blockTimestamp = etherUnsigned(await auction.getBlockTimestamp());
            const deadline = blockTimestamp.plus(10);

            try {
                await auction.selectCandidates([keeper1, keeper2, unbid], deadline, {from: unbid});
            } catch (e) {
                expect(e.reason).equals("Ownable: caller is not the owner");
            }
        });

        it('check deadline', async () => {
            let biddable = await auction.biddable();
            expect(biddable).equals(true);

            const blockTimestamp = etherUnsigned(await auction.getBlockTimestamp());
            const deadline = blockTimestamp.plus(10);

            try {
                await auction.selectCandidates([keeper1, keeper2, unbid], blockTimestamp, {from: owner});
            } catch (e) {
                expect(e.reason).equals("KeeperAuction::selectCandidates: deadline error");
            }

            biddable = await auction.biddable();
            expect(biddable).equals(true);

            await auction.selectCandidates([keeper1, keeper2, unbid], deadline, {from: owner});

            biddable = await auction.biddable();
            expect(biddable).equals(false);
        });

        it('select candidates and check can\'t bid', async () => {
            await wBTC.transfer(keeper1, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(keeper2, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(keeper3, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(unbid, etherUnsigned("1000000000"), {from: holder});

            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper1});
            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper2});
            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper3});

            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper1});
            await auction.bid(0, wBTC.address, etherUnsigned("150000000"), {from: keeper2});
            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper2});
            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper1});

            let biddable = await auction.biddable();
            expect(biddable).equals(true);

            const blockTimestamp = etherUnsigned(await auction.getBlockTimestamp());
            const deadline = blockTimestamp.plus(10);

            await auction.selectCandidates([keeper1, keeper2, unbid], deadline);

            try {
                await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: unbid});
            } catch (e) {
                expect(e.reason).equals("KeeperAuction::bid: stop bid");
            }
        });

        it('check cancel after select candidates', async () => {
            await wBTC.transfer(keeper1, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(keeper2, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(keeper3, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(unbid, etherUnsigned("1000000000"), {from: holder});

            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper1});
            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper2});
            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper3});

            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper1});
            await auction.bid(0, wBTC.address, etherUnsigned("150000000"), {from: keeper2});
            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper2});
            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper1});

            let biddable = await auction.biddable();
            expect(biddable).equals(true);

            const blockTimestamp = etherUnsigned(await auction.getBlockTimestamp());
            const deadline = blockTimestamp.plus(10);

            await auction.selectCandidates([keeper1, keeper2, unbid], deadline);

            let bid0 = await auction.getBid(0);
            expect(bid0.owner).equals(keeper1);
            expect(bid0.live).equals(true);

            await auction.cancel(0, {from: keeper1});

            bid0 = await auction.getBid(0);
            expect(bid0.owner).equals(keeper1);
            expect(bid0.live).equals(false);
        });

        it('check refund after select candidates', async () => {
            await wBTC.transfer(keeper1, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(keeper2, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(keeper3, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(unbid, etherUnsigned("1000000000"), {from: holder});

            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper1});
            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper2});
            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper3});

            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper1});
            await auction.bid(0, wBTC.address, etherUnsigned("150000000"), {from: keeper2});
            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper2});
            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper1});

            let biddable = await auction.biddable();
            expect(biddable).equals(true);

            const blockTimestamp = etherUnsigned(await auction.getBlockTimestamp());
            const deadline = blockTimestamp.plus(100);

            await auction.selectCandidates([keeper1, keeper2, unbid], deadline);

            let keep1Balance = await wBTC.balanceOf(keeper1);
            expect(keep1Balance.toString()).equals("900000000");

            let bid0 = await auction.getBid(0);
            expect(bid0.live).equals(true);
            let bid3 = await auction.getBid(3);
            expect(bid3.live).equals(true);

            await auction.refund({from: keeper1});

            keep1Balance = await wBTC.balanceOf(keeper1);
            expect(keep1Balance.toString()).equals("1000000000");

            bid0 = await auction.getBid(0);
            expect(bid0.live).equals(false);
            bid3 = await auction.getBid(3);
            expect(bid3.live).equals(false);
        });

        it('check end states', async () => {
            await wBTC.transfer(keeper1, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(keeper2, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(keeper3, etherUnsigned("1000000000"), {from: holder});
            await wBTC.transfer(unbid, etherUnsigned("1000000000"), {from: holder});

            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper1});
            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper2});
            await wBTC.approve(auction.address, etherUnsigned("1000000000"), {from: keeper3});

            await hBTC.transfer(keeper1, etherUnsigned("1000000000000000000"), {from: holder});
            await hBTC.transfer(keeper2, etherUnsigned("1000000000000000000"), {from: holder});
            await hBTC.transfer(keeper3, etherUnsigned("1000000000000000000"), {from: holder});
            await hBTC.transfer(unbid, etherUnsigned("1000000000000000000"), {from: holder});

            await hBTC.approve(auction.address, etherUnsigned("1000000000000000000"), {from: keeper1});
            await hBTC.approve(auction.address, etherUnsigned("1000000000000000000"), {from: keeper2});
            await hBTC.approve(auction.address, etherUnsigned("1000000000000000000"), {from: keeper3});

            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper1});
            await auction.bid(0, wBTC.address, etherUnsigned("150000000"), {from: keeper2});
            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper2});
            await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: keeper1});

            let biddable = await auction.biddable();
            expect(biddable).equals(true);

            const blockTimestamp = etherUnsigned(await auction.getBlockTimestamp());
            const deadline = blockTimestamp.plus(10);

            await auction.selectCandidates([keeper1, keeper2, unbid], deadline);

            try {
                await auction.bid(0, wBTC.address, etherUnsigned("50000000"), {from: unbid});
            } catch (e) {
                expect(e.reason).equals("KeeperAuction::bid: stop bid");
            }
        });
    });
});
