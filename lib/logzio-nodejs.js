const { networkInterfaces } = require('os');
const stringifySafe = require('json-stringify-safe');
const dgram = require('dgram');
const zlib = require('zlib');
const axiosInstance = require('./axiosInstance');

const nanoSecDigits = 9;
const USER_AGENT = 'Logzio-Logger NodeJS';
const UNAVAILABLE_CODES = ['ETIMEDOUT', 'ECONNRESET', 'ESOCKETTIMEDOUT', 'ECONNABORTED'];
const protocolToPortMap = {
    udp: 5050,
    http: 8070,
    https: 8071,
};

exports.version = require('../package.json').version;

const jsonToString = (json) => {
    try {
        return JSON.stringify(json);
    } catch (ex) {
        return stringifySafe(json, null, null, () => {});
    }
};

const messagesToBody = (messages) => messages.map(jsonToString).join('\n');

const zlibPromised = (body) => new Promise((resolve, reject) => {
    zlib.gzip(body, (err, res) => {
        if (err) return reject(err);
        resolve(res);
    });
});

class LogzioLogger {
    constructor({
        token,
        host = 'listener.logz.io',
        type = 'nodejs',
        sendIntervalMs = 10 * 1000,
        bufferSize = 100,
        debug = false,
        numberOfRetries = 3,
        suppressErrors = false,
        addTimestampWithNanoSecs = false,
        compress = false,
        internalLogger = console,
        protocol = 'http',
        port,
        timeout,
        sleepUntilNextRetry = 2 * 1000,
        callback,
        setUserAgent = true,
        extraFields = {},
    }) {
        if (!token) {
            throw new Error('You are required to supply a token for logging.');
        }

        this.token = token;
        this.host = host;
        this.type = type;
        this.sendIntervalMs = sendIntervalMs;
        this.bufferSize = bufferSize;
        this.debug = debug;
        this.numberOfRetries = numberOfRetries;
        this.suppressErrors = suppressErrors;
        this.addTimestampWithNanoSecs = addTimestampWithNanoSecs;
        this.compress = compress;
        this.internalLogger = internalLogger;
        this.sleepUntilNextRetry = sleepUntilNextRetry;
        this.setUserAgent = setUserAgent;
        this.timeout = timeout;
        this.callback = callback || this._defaultCallback;
        this.extraFields = extraFields;
        this.messages = [];
        this.bulkId = 1;
        this.typeOfIP = 'IPv4';
        this.closed = false;

        this._setProtocol(protocol, port);
        this._configureAxios();
    }

    _setProtocol(protocol, port) {
        if (!protocolToPortMap[protocol]) {
            throw new Error(`Invalid protocol defined. Valid options are: ${Object.keys(protocolToPortMap).join(', ')}`);
        }
        this.protocol = protocol;
        this.port = p
