var logzioLogger = require('../lib/logzio-nodejs.js');
var sinon = require('sinon');
var assert = require('assert');

var dummyHost = 'logz.io';

var createLogger = function (options) {
    var myoptions = options;
    myoptions.token = 'acrSGIefherhsZYOpzxeGBpTyqgSzaMk';
    myoptions.type = 'testnode';
    myoptions.debug = true;
    myoptions.host = dummyHost;
    myoptions.sendIntervalMs = options.sendIntervalMs || 1000;
    return logzioLogger.createLogger(myoptions);
};

describe('sending udp', function () {
    it('sends single log', function (done) {
        var logger = createLogger({
            bufferSize: 1,
            protocol: 'udp'
        });

        var udpSentCounter = 0;
        sinon.stub(logger.udpClient, 'send', function () { udpSentCounter++; });

        logger.log('hello from the other side');
        assert(udpSentCounter === 1);

        logger.close();
        done();
    });

    it('sends multiple logs', function (done) {
        var logger = createLogger({
            bufferSize: 2,
            protocol: 'udp'
        });

        var udpSentCounter = 0;
        sinon.stub(logger.udpClient, 'send', function () { udpSentCounter++; });

        logger.log('hello from the other side');
        logger.log('hello from the other side');
        logger.log('hello from the other side');
        logger.log('hello from the other side');
        assert(udpSentCounter === 4);

        logger.close();
        done();
    });

    it('sends logs after close', function (done) {
        var logger = createLogger({
            bufferSize: 10,
            protocol: 'udp'
        });

        var udpSentCounter = 0;
        sinon.stub(logger.udpClient, 'send', function () { udpSentCounter++; });

        logger.log('hello from the other side');
        logger.log('hello from the other side');
        logger.log('hello from the other side');
        logger.log('hello from the other side');
        assert(udpSentCounter === 0);

        logger.close();
        assert(udpSentCounter === 4);

        done();
    });

    it('call callback on udp error', function (done) {

        var udpError = 'udp error';

        var logger = createLogger({
            bufferSize: 1,
            protocol: 'udp',
            callback: function assertCalled(err) {
                assert(err.message.indexOf('Failed to send udp log message') >= 0);
                done();
            }

        });

        sinon.stub(logger.udpClient, 'send', function (buffer, offset, length, port, address, callback) {
            callback(udpError);
        });

        logger.log('hello from the other side');
        logger.sendAndClose();
    });
});
