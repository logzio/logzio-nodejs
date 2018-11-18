const sinon = require('sinon');
const request = require('request-promise');
const nock = require('nock');
const assert = require('assert');
const moment = require('moment');
const zlib = require('zlib');
const logzioLogger = require('../lib/logzio-nodejs.js');

const dummyHost = 'logz.io';
const nockHttpAddress = `http://${dummyHost}:8070`;

const createLogger = function (options) {
    const myoptions = options;
    myoptions.token = 'testToken';
    myoptions.type = 'testnode';
    myoptions.debug = true;
    myoptions.host = dummyHost;
    myoptions.sendIntervalMs = options.sendIntervalMs || 1000;
    return logzioLogger.createLogger(myoptions);
};


describe('logger', () => {
    describe('logs a single line', () => {
        before((done) => {
            sinon
                .stub(request, 'post')
                .resolves({
                    statusCode: 200,
                });
            done();
        });

        after((done) => {
            request.post.restore();
            done();
        });

        it('sends log as a string', (done) => {
            const logger = createLogger({
                bufferSize: 1,
                callback: done,
            });
            sinon.spy(logger, '_createBulk');

            const logMsg = 'hello there from test';
            logger.log(logMsg);
            assert.equal(logger._createBulk.getCall(0).args[0][0].message, logMsg);
            logger._createBulk.restore();
            logger.close();
        });

        it('sends log as a string with extra fields', (done) => {
            const logger = createLogger({
                bufferSize: 1,
                callback: done,
                extraFields: {
                    extraField1: 'val1',
                    extraField2: 'val2',
                },
            });
            sinon.spy(logger, '_createBulk');

            const logMsg = 'hello there from test';
            logger.log(logMsg);
            assert(logger._createBulk.getCall(0).args[0][0].extraField1 == 'val1');
            assert(logger._createBulk.getCall(0).args[0][0].extraField2 == 'val2');

            logger._createBulk.restore();
            logger.close();
        });

        it('sends log as an object', (done) => {
            const logger = createLogger({
                bufferSize: 1,
                callback: done,
            });
            sinon.spy(logger, '_createBulk');

            const logMsg = {
                message: 'hello there from test',
            };
            logger.log(logMsg);
            assert(logger._createBulk.getCall(0).args[0][0].message == logMsg.message);

            logger._createBulk.restore();
            logger.close();
        });

        it('sends log as an object with extra fields', (done) => {
            const logger = createLogger({
                bufferSize: 1,
                callback: done,
                extraFields: {
                    extraField1: 'val1',
                    extraField2: 'val2',
                },
            });
            sinon.spy(logger, '_createBulk');

            const logMsg = {
                message: 'hello there from test',
            };
            logger.log(logMsg);
            assert(logger._createBulk.getCall(0).args[0][0].extraField1 == 'val1');
            assert(logger._createBulk.getCall(0).args[0][0].extraField2 == 'val2');

            logger._createBulk.restore();
            logger.close();
        });

        it('sends compressed log as an object with extra fields', (done) => {
            const extraField1 = 'val1';
            const extraField2 = 'val2';
            const logger = createLogger({
                bufferSize: 1,
                callback: onDone,
                extraFields: {
                    extraField1,
                    extraField2,
                },
                compress: true,
            });

            sinon.spy(logger, '_tryToSend');
            const logMsg = {
                message: 'hello there from test',
            };

            logger.log(logMsg);

            function onDone() {
                assert(logger._tryToSend.getCall(0).args[0].headers['content-encoding'] == 'gzip');
                const unzipBody = JSON.parse(zlib.gunzipSync(logger._tryToSend.getCall(0).args[0].body));
                assert(unzipBody.message == logMsg.message);
                assert(unzipBody.extraField1 == extraField1);
                assert(unzipBody.extraField2 == extraField2);
                logger._tryToSend.restore();
                logger.close();
                done();
            }
        });

        it('sends log as an object with type', (done) => {
            const logger = createLogger({
                bufferSize: 1,
                callback: done,
            });
            sinon.spy(logger, '_createBulk');

            const logMsg = {
                message: 'hello there from test',
                type: 'myTestType',
            };
            logger.log(logMsg);
            assert(logger._createBulk.getCall(0).args[0][0].message == logMsg.message);
            assert(logger._createBulk.getCall(0).args[0][0].type == logMsg.type);

            logger._createBulk.restore();
            logger.close();
        });

        it('adds nano seconds when added to options', (done) => {
            // testing without nano seconds
            let logger = createLogger({
                bufferSize: 1,
            });
            sinon.spy(logger, '_createBulk');

            logger.log({
                message: 'hello there from test',
            });
            assert(!logger._createBulk.getCall(0).args[0][0].hasOwnProperty('@timestamp_nano_secs'));

            logger._createBulk.restore();
            logger.close();

            // testing with nano seconds
            logger = createLogger({
                bufferSize: 1,
                callback: done,
                addTimestampWithNanoSecs: true,
            });
            sinon.spy(logger, '_createBulk');

            logger.log({
                message: 'hello there from test',
            });
            assert(logger._createBulk.getCall(0).args[0][0].hasOwnProperty('@timestamp_nano'));

            logger._createBulk.restore();
            logger.close();
        });
        it('writes a log message without @timestamp', (done) => {
            const logger = createLogger({
                // buffer is 2 so we could access the log before we send it, to analyze it
                bufferSize: 2,
                callback: done,
            });

            const fakeTime = moment('2011-09-01').valueOf();

            // Fake the current time, so we could test on it
            const clock = sinon.useFakeTimers(fakeTime);
            logger.log({
                message: 'hello there from test',
            });
            clock.restore();

            assert.equal(fakeTime, moment(logger.messages[logger.messages.length - 1]['@timestamp'].valueOf()));
            logger.close();
        });
        it('writes a log message with a custom @timestamp', (done) => {
            const logger = createLogger({
                // buffer is 2 so we could access the log before we send it, to analyze it
                bufferSize: 2,
                callback: done,
            });

            const fakeTime = moment('2011-09-01');

            logger.log({
                message: 'hello there from test',
                '@timestamp': fakeTime.format(),
            });

            assert.equal(fakeTime.format(), logger.messages[logger.messages.length - 1]['@timestamp']);
            logger.close();
        });
    });

    describe('logs multiple lines', () => {
        before((done) => {
            sinon
                .stub(request, 'post')
                .resolves({
                    statusCode: 200,
                });
            done();
        });

        after((done) => {
            request.post.restore();
            done();
        });

        it('Send multiple lines', (done) => {
            const logger = createLogger({
                bufferSize: 3,
                callback: done,
            });

            logger.log({
                messge: 'hello there from test',
                testid: 2,
            });
            logger.log({
                messge: 'hello there from test2',
                testid: 2,
            });
            logger.log({
                messge: 'hello there from test3',
                testid: 2,
            });

            logger.close();
        });

        it('Send multiple bulks', (done) => {
            let timesCalled = 0;
            const expectedTimes = 2;

            function assertCalled() {
                timesCalled += 1;

                if (expectedTimes === timesCalled) {
                    done();
                } else if (timesCalled > expectedTimes) {
                    throw new Error('called more than expected');
                }
            }

            const logger = createLogger({
                bufferSize: 3,
                callback: assertCalled,
            });

            logger.log({
                messge: 'hello there from test',
                testid: 4,
            });
            logger.log({
                messge: 'hello there from test2',
                testid: 4,
            });
            logger.log({
                messge: 'hello there from test3',
                testid: 4,
            });
            logger.log({
                messge: 'hello there from test',
                testid: 4,
            });
            logger.log({
                messge: 'hello there from test2',
                testid: 4,
            });
            logger.log({
                messge: 'hello there from test3',
                testid: 4,
            });

            logger.close();
        });
    });

    describe('#log-closing', () => {
        before((done) => {
            sinon
                .stub(request, 'post')
                .resolves({
                    statusCode: 200,
                });
            done();
        });

        after((done) => {
            request.post.restore();
            done();
        });

        it('Don\'t allow logs after closing', (done) => {
            const logger = createLogger({
                bufferSize: 1,
            });
            logger.close();
            try {
                logger.log({
                    messge: 'hello there from test',
                });
                done('Expected an error when logging into a closed log!');
            } catch (ex) {
                done();
            }
        });
    });

    describe('timers', () => {
        before((done) => {
            sinon
                .stub(request, 'post')
                .resolves({
                    statusCode: 200,
                });
            done();
        });

        after((done) => {
            request.post.restore();
            done();
        });

        it('timer send test', function (done) {
            this.timeout(5000);
            const bufferSize = 100;
            let timesCalled = 0;
            const expectedTimes = 2;

            function assertCalled() {
                timesCalled += 1;
                if (expectedTimes === timesCalled) done();
            }

            const logger = createLogger({
                bufferSize,
                callback: assertCalled,
                sendIntervalMs: 10,
            });

            // These messages should be sent in 1 bulk 10 seconds from now (due to sendIntervalMs)
            logger.log({
                messge: 'hello there from test',
                testid: 5,
            });
            logger.log({
                messge: 'hello there from test2',
                testid: 5,
            });
            logger.log({
                messge: 'hello there from test3',
                testid: 5,
            });

            // Schedule 100 msgs (buffer size) which should be sent in one bulk 11 seconds from start
            setTimeout(() => {
                Array(bufferSize).fill(null).forEach(() => {
                    logger.log({
                        messge: 'hello there from test',
                        testid: 6,
                    });
                });
                logger.close();
            }, 30);
        });
    });

    describe('recovers after server fails one time', function () {
        this.timeout(10000);

        let errorAndThenSuccessScope;
        let extraRequestScope;
        const socketDelay = 20;

        before((done) => {
            nock.cleanAll();
            errorAndThenSuccessScope = nock(nockHttpAddress)
                .post('/')
                .socketDelay(socketDelay)
                .query(true)
                .once()
                .reply(200, '')

                // success
                .post('/')
                .socketDelay(0)
                .query(true)
                .once()
                .reply(200, '');

            extraRequestScope = nock(nockHttpAddress)
                .filteringPath(() => '/')
                .post('/')
                .once()
                .reply(200, '');

            done();
        });

        after((done) => {
            nock.restore();
            nock.cleanAll();
            done();
        });

        it('Msgs are only sent once', (done) => {
            // very small timeout so the first request will fail (nock setup this way above) and
            // then second attempt will succeed
            const logger = createLogger({
                bufferSize: 1,
                sendIntervalMs: 50000,
                timeout: socketDelay / 2,
                sleepUntilNextRetry: socketDelay * 2,
            });

            logger.log({
                messge: 'hello there from test',
                testid: 5,
            });
            logger.close();

            setTimeout(() => {
                if (!errorAndThenSuccessScope.isDone()) {
                    done(new Error(`pending mocks: ${errorAndThenSuccessScope.pendingMocks()}`));
                } else if (extraRequestScope.isDone()) {
                    done(new Error('We don\'t expect another request'));
                } else {
                    done();
                }
            }, socketDelay * 3);
        });
    });

    describe('bad request', () => {
        before((done) => {
            sinon
                .stub(request, 'post')
                .rejects({
                    statusCode: 400,
                    cause: { code: 'BAD_REQUEST' },
                    messge: 'bad',
                });
            done();
        });

        after((done) => {
            request.post.restore();
            done();
        });

        it('bad request test', (done) => {
            const logger = createLogger({
                bufferSize: 3,
                callback(err) {
                    if (err) {
                        done();
                        return;
                    }

                    done('Expected an error');
                },
            });
            logger.log({
                messge: 'hello there from test',
                testid: 2,
            });
            logger.log({
                messge: 'hello there from test2',
                testid: 2,
            });
            logger.log({
                messge: 'hello there from test3',
                testid: 2,
            });
            logger.close();
        });
    });
});
