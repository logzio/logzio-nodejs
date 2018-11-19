const sinon = require('sinon');
const assert = require('assert');
const logzioLogger = require('../lib/logzio-nodejs.js');

const dummyHost = 'logz.io';

const createLogger = function (options) {
    const myoptions = options;
    myoptions.token = 'acrSGIefherhsZYOpzxeGBpTyqgSzaMk';
    myoptions.type = 'testnode';
    myoptions.debug = true;
    myoptions.host = dummyHost;
    myoptions.sendIntervalMs = options.sendIntervalMs || 1000;
    return logzioLogger.createLogger(myoptions);
};

describe('sending udp', () => {
    it('sends single log', (done) => {
        const logger = createLogger({
            bufferSize: 1,
            protocol: 'udp',
        });

        let udpSentCounter = 0;
        sinon.stub(logger.udpClient, 'send').callsFake(() => { udpSentCounter += 1; });

        logger.log('hello from the other side');
        assert(udpSentCounter === 1);

        logger.close();
        done();
    });

    it('sends multiple logs', (done) => {
        const logger = createLogger({
            bufferSize: 2,
            protocol: 'udp',
        });

        let udpSentCounter = 0;
        sinon.stub(logger.udpClient, 'send').callsFake(() => { udpSentCounter += 1; });

        logger.log('hello from the other side');
        logger.log('hello from the other side');
        logger.log('hello from the other side');
        logger.log('hello from the other side');
        assert(udpSentCounter === 4);

        logger.close();
        done();
    });

    it('sends logs after close', (done) => {
        const logger = createLogger({
            bufferSize: 10,
            protocol: 'udp',
        });

        let udpSentCounter = 0;
        sinon.stub(logger.udpClient, 'send').callsFake(() => { udpSentCounter += 1; });

        logger.log('hello from the other side');
        logger.log('hello from the other side');
        logger.log('hello from the other side');
        logger.log('hello from the other side');
        assert(udpSentCounter === 0);

        logger.close();
        assert(udpSentCounter === 4);

        done();
    });

    it('call callback on udp error', (done) => {
        const udpError = 'udp error';

        const logger = createLogger({
            bufferSize: 1,
            protocol: 'udp',
            callback: function assertCalled(err) {
                assert(err.message.indexOf('Failed to send udp log message') >= 0);
                done();
            },

        });

        sinon.stub(logger.udpClient, 'send').callsFake((buffer, offset, length, port, address, callback) => {
            callback(udpError);
        });

        logger.log('hello from the other side');
        logger.sendAndClose();
    });
});
