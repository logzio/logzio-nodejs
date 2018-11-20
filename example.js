const logzioLogger = require('./index');

const token = 'YOUR_TOKEN';
const count = 1;

const logger = logzioLogger.createLogger({
    token,
    type: 'thingk-tenant-app',
    protocol: 'http',
    sendIntervalMs: 3000,
    bufferSize: 64,
    numberOfRetries: 5,
    addNanoSecs: true,
    callback(err) {
        console.error(err);
    },
    debug: true,
    timeout: 1000,
});


logger.log('some testing');

for (let i = 0; i < count; i++) {
    logger.log(`hello, this is test #:${i}`);
}
