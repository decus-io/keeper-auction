const {
    encodeParameters,
    etherUnsigned,
    increaseTime,
    keccak256
} = require('./utils/Ethereum');

const Timelock = artifacts.require("Timelock");

const twoDayInSeconds = etherUnsigned(2 * 24 * 60 * 60);
const zero = etherUnsigned(0);

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
    let eta;
    let queuedTxHash;

    beforeEach(async () => {
        [root, notAdmin, newAdmin] = accounts;
        timelock = await Timelock.new(root, delay);
    
        blockTimestamp = etherUnsigned(await timelock.getBlockTimestamp());
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
            let configuredAdmin = await timelock.admin();
            expect(configuredAdmin).equal(root);
        });
    
        it('sets delay', async () => {
            let configuredDelay = await timelock.delay();
            expect(configuredDelay.toString()).equal(delay.toString());
        });
    });

    describe('setDelay', () => {
        it('requires msg.sender to be Timelock', async () => {
            try {
                await timelock.setDelay(delay, { from: root });
                assert.fail();
            } catch (e) {
                expect(e.reason).equal('Timelock::setDelay: Call must come from Timelock.');
            }
        });
    });

    describe('cancelTransaction', () => {
        beforeEach(async () => {
            await timelock.queueTransaction(target, value, signature, data, eta, { from: root });
        });

        it('requires admin to be msg.sender', async () => {
            try {
                await timelock.cancelTransaction(target, value, signature, data, eta, { from: notAdmin });
            } catch (e) {
                expect(e.reason).equal('Timelock::cancelTransaction: Call must come from admin.');
            }
        });

        it('should emit CancelTransaction event', async () => {
            const result = await timelock.cancelTransaction(target, value, signature, data, eta, {
                from: root
            });
      
            expect(result.logs[0].args).contain({
                data,
                signature,
                target,
                txHash: queuedTxHash,
            });
        });
    });

    describe('executeTransaction (setDelay)', () => {
        beforeEach(async () => {
            // Queue transaction that will succeed
            await timelock.queueTransaction(target, value, signature, data, eta, {
                from: root
            });
        });

        it('requires transaction to be queued', async () => {
            const differentEta = eta.plus(1);

            try {
                await timelock.executeTransaction(target, value, signature, data, differentEta, {
                    from: root
                });
                assert.fail();
            } catch (e) {
                expect(e.reason).equal("Timelock::executeTransaction: Transaction hasn't been queued.");
            }
        });
      
        it('requires timestamp to be greater than or equal to eta', async () => {
            try {
                await timelock.executeTransaction(target, value, signature, data, eta, {
                    from: root
                });
                assert.fail();
            } catch (e) {
                expect(e.reason).equal("Timelock::executeTransaction: Transaction hasn't surpassed time lock.");
            }
        });

        it('requires target.call transaction to succeed', async () => {
            await increaseTime(twoDayInSeconds.plus(1).toNumber());

            await timelock.executeTransaction(target, value, signature, data, eta, {
                from: root
            });
        });
    });
});
