const { networkInterfaces } = require('os');
const sinon = require('sinon');
const nock = require('nock');
const assert = require('assert');
const moment = require('moment');
const zlib = require('zlib');
const logzioLogger = require('../lib/logzio-nodejs.js');
const hrtimemock = require('hrtimemock');
const axiosInstance = require('../lib/axiosInstance.js');
const prop = require('../package.json');
axiosInstance.defaults.adapter = 'http';
const { trace, context } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');


const dummyHost = 'logz.io';
const nockHttpAddress = `http://${dummyHost}:8070`;

const createLogger = function createLogger(options) {
    const myOptions = options;
    myOptions.token = 'testToken';
    myOptions.type = 'test-node';
    myOptions.debug = options.debug??true;
    myOptions.host = dummyHost;
    myOptions.sendIntervalMs = options.sendIntervalMs || 1000;
    return logzioLogger.createLogger(myOptions);
};

const sendLogs = (logger, count = 1, message = 'hello there from test') => {
    Array(count).fill().forEach((item, i) => {
        logger.log({
            message: `${message} #${i}`,
            id: i,
        });
    });
};

const provider = new NodeTracerProvider();
provider.register();
const tracer = trace.getTracer('test-tracer');


describe('logger', () => {
    describe('_addOpentelemetryContext', () => {
      it('should attach traceId and spanId when a span is active', () => {
        let logger = createLogger({
          bufferSize: 1,
        });
        sinon.spy(logger, '_createBulk');
    
        let logMessage;
    
        tracer.startActiveSpan('test-span', (span) => {
          logMessage = {
            message: 'test message with active span'
          };
          logger.log(logMessage);
          span.end();
        });
    
        const loggedMessage = logger._createBulk.getCall(0).args[0][0];
        assert(loggedMessage.trace_id, 'trace_id should exist');
        assert(loggedMessage.span_id, 'span_id should exist');
      });
    
      it('should not attach traceId or spanId when no span is active', () => {
        let logger = createLogger({
          bufferSize: 1,
          });
        sinon.spy(logger, '_createBulk');
        let logMessage = {
          message: 'test message without active span'
        };
    
        logger.log(logMessage);
    
        const loggedMessage = logger._createBulk.getCall(0).args[0][0];
        assert.strictEqual(loggedMessage.trace_id, undefined, 'trace_id should not exist');
        assert.strictEqual(loggedMessage.span_id, undefined, 'span_id should not exist');
      });
    });
    describe('logs a single line', () => {
        beforeAll((done) => {
            sinon
                .stub(axiosInstance, 'post')
                .resolves({
                    statusCode: 200,
                });
            done();
        });

        afterAll((done) => {
            axiosInstance.post.restore();
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

        it('sends log with user-agent header', (done) => {
            const logger = createLogger({
                bufferSize: 1,
                callback: onDone
            });
            sinon.spy(logger, '_tryToSend');

            const logMsg = 'hello there from test';
            logger.log(logMsg);

            function onDone() {
                assert.equal(axiosInstance.defaults.headers.post['user-agent'], `NodeJS/${prop.version} logs`);
                logger._tryToSend.restore();
                logger.close();
                done();
            }
        });

        it('should send a log with an object as additional param', (done) => {
            const logger = createLogger({
                bufferSize: 1,
                callback: done,
            });
            sinon.spy(logger, '_createBulk');
            const obj = { key1: "val1", key2: "val2"};
            const strMsg = 'message: ';
            const expectedLog = strMsg + JSON.stringify(obj);
            logger.log(strMsg, obj);

            assert.equal(logger._createBulk.getCall(0).args[0][0].message, expectedLog);
            logger._createBulk.restore();
            logger.close();
        });
        it('log with sourceIP', (done) => {
            const logger = createLogger({
                bufferSize: 1,
                callback: done,
            });
            sinon.spy(logger, '_createBulk');
            const { en0 } = networkInterfaces();
            let sourceIP;
            if (en0 && en0.length > 0) {
                en0.forEach((ip) => {
                    // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
                    // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
                    const familyV4Value = typeof ip.family === 'string' ? 'IPv4' : 4;
                    if (ip.family === familyV4Value && !ip.internal) {
                        sourceIP = ip.address;
                    }
                });
            }
            logger.log({ message: 'sourceIp' });

            assert.equal(logger._createBulk.getCall(0).args[0][0].sourceIP, sourceIP);
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
            assert.equal(logger._createBulk.getCall(0).args[0][0].extraField1, 'val1');
            assert.equal(logger._createBulk.getCall(0).args[0][0].extraField2, 'val2');

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
            assert.equal(logger._createBulk.getCall(0).args[0][0].message, logMsg.message);

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
            assert.equal(logger._createBulk.getCall(0).args[0][0].extraField1, 'val1');
            assert.equal(logger._createBulk.getCall(0).args[0][0].extraField2, 'val2');

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
                assert.equal(axiosInstance.defaults.headers.post['content-encoding'], 'gzip');
                const unzipBody = JSON.parse(zlib.gunzipSync(logger._tryToSend.getCall(0).args[0]));
                assert.equal(unzipBody.message, logMsg.message);
                assert.equal(unzipBody.extraField1, extraField1);
                assert.equal(unzipBody.extraField2, extraField2);
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
            assert.equal(logger._createBulk.getCall(0).args[0][0].message, logMsg.message);
            assert.equal(logger._createBulk.getCall(0).args[0][0].type, logMsg.type);

            logger._createBulk.restore();
            logger.close();
        });

        it('should not include nano timestamp by default', (done) => {
            let logger = createLogger({
                bufferSize: 1,
                callback: done
            });
            sinon.spy(logger, '_createBulk');

            logger.log({
                message: 'hello there from test',
            });
            assert.equal(logger._createBulk.getCall(0).args[0][0].hasOwnProperty('@timestamp_nano_secs'), false);

            logger._createBulk.restore();
            logger.close();
        });

        it('should add a valid nano-sec timestamp to the log', (done) => {
            var mockTime = 0.123456;
            var expectedLogTime = '000123456';

            logger = createLogger({
                bufferSize: 1,
                callback: done,
                addTimestampWithNanoSecs: true,
            });
            sinon.spy(logger, '_createBulk');
            hrtimemock(mockTime);
            process.hrtime();
            logger.log({
                message: 'hello there from test'
            })
            const mockLogCall = logger._createBulk.getCall(0).args[0][0];
            assert.equal(mockLogCall['@timestamp_nano'].endsWith(expectedLogTime), true);

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
        beforeAll((done) => {
            sinon
                .stub(axiosInstance, 'post')
                .resolves({
                    statusCode: 200,
                });
            done();
        });

        afterAll((done) => {
            axiosInstance.post.restore();
            done();
        });

        it('Send multiple lines', (done) => {
            const logger = createLogger({
                bufferSize: 3,
                callback: done,
            });

            sendLogs(logger, 3);

            logger.close();
        });

        it('Send multiple bulks', (done) => {
            let timesCalled = 0;
            const bufferSize = 3;
            const logCount = 6;
            const expectedTimes = logCount / bufferSize;

            function assertCalled() {
                timesCalled += 1;

                if (expectedTimes === timesCalled) {
                    done();
                } else if (timesCalled > expectedTimes) {
                    throw new Error('called more than expected');
                }
            }

            const logger = createLogger({
                bufferSize,
                callback: assertCalled,
            });

            sendLogs(logger, logCount);

            logger.close();
        });
    });

    describe('#log-closing', () => {
        beforeAll((done) => {
            sinon
                .stub(axiosInstance, 'post')
                .resolves({
                    statusCode: 200,
                });
            done();
        });

        afterAll((done) => {
            axiosInstance.post.restore();
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
        beforeAll((done) => {
            sinon
                .stub(axiosInstance, 'post')
                .resolves({
                    statusCode: 200,
                });
            done();
        });

        afterAll((done) => {
            axiosInstance.post.restore();
            done();
        });

        it('timer send test', (done) => {
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
            sendLogs(logger, 3);
            // Schedule 100 msgs (buffer size)
            // which should be sent in one bulk 11 seconds from start
            setTimeout(() => {
                sendLogs(logger, bufferSize);
                logger.close();
            }, 30);
        }, 5000);
    });

    describe('recovers after server fails one time', () => {
        let errorAndThenSuccessScope;
        let extraRequestScope;
        const socketDelay = 20;

        beforeAll((done) => {
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

        afterAll((done) => {
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

            sendLogs(logger);
            logger.close();

            setTimeout(() => {
                if (!errorAndThenSuccessScope.isDone()) {
                    done(new Error(`pending mocks: ${errorAndThenSuccessScope.pendingMocks()}`));
                } else if (extraRequestScope.isDone()) {
                    done(new Error('We don\'t expect another request'));
                } else {
                    done();
                }
            }, socketDelay * 5);
        }, 10000);
    });

    describe('bad request', () => {
        afterEach((done) => {
            axiosInstance.post.restore();
            done();
        });

        it('bad request with code', (done) => {
            sinon
                .stub(axiosInstance, 'post')
                .rejects({
                    statusCode: 400,
                    cause: { code: 'BAD_REQUEST' },
                    messge: 'bad',
                });

            const logger = createLogger({
                bufferSize: 3,
                callback(err) {
                    if (err) {
                        done();
                        return;
                    }

                    done(new Error('Expected an error'));
                },
            });

            sendLogs(logger, 3);

            logger.close();
        });

        it('bad request with no cause nor code', (done) => {
            sinon
                .stub(axiosInstance, 'post')
                .rejects({
                    statusCode: 400,
                    message: 'bad',
                });

            const logger = createLogger({
                bufferSize: 3,
                callback(err) {
                    if (err) {
                        done();
                        return;
                    }

                    done(new Error('Expected an error'));
                },
            });

            sendLogs(logger, 3);

            logger.close();
        });
    });

    describe('Logger callback', () => {
        it('should execute external logger', (done) => {
            const internalLogger = {
                log: () => {
                    done();
                },
            };

            const logger = createLogger({
                bufferSize: 1,
                internalLogger,
                debug: false,
                numberOfRetries: 0,
            });

            sendLogs(logger);
            logger.close();
        });
    });

    describe('Flush log messages', () => {

        afterAll((done) => {
            axiosInstance.post.restore();
            done();
        });

        beforeAll((done) => {
            sinon
                .stub(axiosInstance, 'post')
                .resolves({
                    statusCode: 200,
                });
            done();
        });

        it('should send one log at a time', (done) => {
            let timesCalled = 0;
            const bufferSize = 3;
            const logCount = 3;
            const expectedTimes = 3;

            function assertCalled() {
                timesCalled += 1;

                if (logCount === timesCalled) {
                    done();
                } else if (timesCalled > expectedTimes) {
                    throw new Error('called less times than expected');
                }
            }

            const logger = createLogger({
                bufferSize,
            });

            Array(logCount).fill().forEach((item, i) => {
                logger.log({
                    message: `hello there from test #${i}`,
                    id: i,
                });

                logger.flush(assertCalled);
            });

            logger.close();
        });
    });
});
