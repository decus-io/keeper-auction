const {
    mineBlock,
    etherUnsigned
} = require('./utils/Ethereum');

const {
    timeout
} = require('./utils/Time');

const ERC20Mock = artifacts.require("ERC20Mock");
const KeeperImportHarness = artifacts.require("KeeperImportHarness");
const KeeperAuction = artifacts.require("KeeperAuction");

contract("KeeperAuction", accounts => {
    let owner;
    let holder;
    let hBTC;
    let wBTC;
    let auction;
    let keeperImport;

    beforeEach(async () => {
        [owner, holder, unbid, keeper1, keeper2, keeper3] = accounts;
        hBTC = await ERC20Mock.new('Huobi Bitcoin', 'HBTC', 18, etherUnsigned(100000000000000000000),  {from: holder});
        wBTC = await ERC20Mock.new('Wrapped Bitcoin', 'WBTC', 8, 20000000000,  {from: holder});
        auction = await KeeperAuction.new([hBTC.address, wBTC.address], 1, 50000000, {from: owner});
        keeperImport = await KeeperImportHarness.new([hBTC.address, wBTC.address]);
    });

    describe('end', () => {
        it('check gas', async () => {
            for (let i = 0; i < accounts.length; i++) {
                const keeper = accounts[i];
                await wBTC.transfer(keeper, etherUnsigned("50000000"), {from: holder});
                await wBTC.approve(auction.address, etherUnsigned("50000000"), {from: keeper});
                await auction.bid(wBTC.address, 50000000, {from: keeper});
            }

            const blockTimestamp = etherUnsigned(await auction.getBlockTimestamp());
            const deadline = blockTimestamp.plus(2);

            await auction.lockEnd(keeperImport.address, deadline);

            await timeout(2100);
            await mineBlock();

            const keepers = [];
            for (let i = 0; i < 30; i++) {
                keepers.push(accounts[i]);
            }

            const receipt = await auction.end(keepers, {from: owner});
            console.log(`GasUsed: ${receipt.receipt.gasUsed}`);
        });
    });
});
