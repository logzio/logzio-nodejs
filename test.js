var logzioLogger = require('./index');

var logger = logzioLogger.createLogger({
    token: 'thuqwebLGAmdurgIrDjLlpAptmQqUkxQ',
    type: 'thingk-tenant-app',
    protocol: 'https',
    sendIntervalMs: 3000,
    bufferSize: 64,
    numberOfRetries: 5,
    callback: function(ex) {
        return;
    },
    debug: true,
    timeout: 1000
});

console.log('hello');
logger.log('ssl testing');