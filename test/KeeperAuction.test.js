const {
    etherUnsigned
} = require('./utils/Ethereum');

const StandardToken = artifacts.require("StandardToken");
const KeeperAuction = artifacts.require("KeeperAuction");

contract("KeeperAuction", accounts => {
    let owner;
    let holder;
    let hBTC;
    let wBTC;
    let auction;

    beforeEach(async () => {
        [owner, holder] = accounts;
        hBTC = await StandardToken.new(etherUnsigned(8000000000000000000), 'Huobi Bitcoin', 18, 'HBTC', {from: holder});
        wBTC = await StandardToken.new(800000000, 'Wrapped Bitcoin', 8, 'HBTC', {from: holder});
        auction = await KeeperAuction.new([hBTC.address, wBTC.address], {from: owner});
    });

    describe('bid', () => {
        it('insufficient allowance', async () => {
            try {
                await auction.bid(hBTC.address, etherUnsigned(1000000000000000000));
                assert.fail();
            } catch (e) {
            }
        });
        
        it('bid 1000000000000000000 hbtc with 3 month', async () => {
            await hBTC.approve(auction.address, etherUnsigned("1000000000001234567"), {from: holder});

            let hBTCBalance = await hBTC.balanceOf(auction.address);
            expect(hBTCBalance.toString()).equals("0");

            const result = await auction.bid(0, hBTC.address, etherUnsigned("1000000000001234567"), {from: holder});

            expect(result.logs[0].args.power.toString()).equals("1000000000");
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
});