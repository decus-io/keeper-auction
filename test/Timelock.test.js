const {
    encodeParameters,
    etherUnsigned,
    freezeTime,
    keccak256
} = require('./utils/Ethereum');

const Timelock = artifacts.require("Timelock");

const twoDayInSeconds = etherUnsigned(2 * 24 * 60 * 60);
const zero = etherUnsigned(0);
const gracePeriod = twoDayInSeconds.multipliedBy(2);

contract("Timelock", accounts => {
    let root, notAdmin, newAdmin;
    let blockTimestamp;
    let timelock;
    let delay = twoDayInSeconds;
    let newDelay = delay.multipliedBy(2);
    let target;
    let value = zero;
    let signature = 'setDelay(uint256)';
    let data = encodeParameters(['uint256'], [newDelay.toFixed()]);
    let revertData = encodeParameters(['uint256'], [etherUnsigned(60 * 60).toFixed()]);
    let eta;
    let queuedTxHash;

    beforeEach(async () => {
        [root, notAdmin, newAdmin] = accounts;
        timelock = await Timelock.new(root, delay);
    
        blockTimestamp = etherUnsigned(100);
        await freezeTime(blockTimestamp.toNumber());
        target = timelock.address;
        eta = blockTimestamp.plus(delay);
    
        queuedTxHash = keccak256(
            encodeParameters(
                ['address', 'uint256', 'string', 'bytes', 'uint256'],
                [target, value.toString(), signature, data, eta.toString()]
            )
        );
    });

    describe('constructor', () => {
        it('sets address of admin', async () => {
            let configuredAdmin = await timelock.admin()
            expect(configuredAdmin).equal(root);
        });
    
        it('sets delay', async () => {
            let configuredDelay = await timelock.delay();
            expect(configuredDelay.toString()).equal(delay.toString());
        });
    });
});