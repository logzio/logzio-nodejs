const request = require('request-promise');
const stringifySafe = require('json-stringify-safe');
const assign = require('lodash.assign');
const dgram = require('dgram');
const zlib = require('zlib');

exports.version = require('../package.json').version;

const jsonToString = (json) => {
    try {
        return JSON.stringify(json);
    } catch (ex) {
        return stringifySafe(json, null, null, () => {});
    }
};

const messagesToBody = messages => messages.reduce((body, msg) => `${body}${jsonToString(msg)}\n`, '');

const UNAVAILABLE_CODES = ['ETIMEDOUT', 'ECONNRESET', 'ESOCKETTIMEDOUT', 'ECONNABORTED'];

const zlibPromised = body => new Promise(((resolve, reject) => {
    zlib.gzip(body, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
    });
}));

const protocolToPortMap = {
    udp: 5050,
    http: 8070,
    https: 8071,
};

const USER_AGENT = 'Logzio-Logger NodeJS';

class LogzioLogger {
    constructor({
        token,
        host = 'listener.logz.io',
        type = 'nodejs',
        sendIntervalMs = 10 * 1000,
        bufferSize = 100,
        debug = false,
        numberOfRetries = 3,
        supressErrors = false,
        addTimestampWithNanoSecs = false,
        compress = false,
        internalLogger = console,
        protocol = 'http',
        port,
        timeout,
        sleepUntilNextRetry = 2 * 1000,
        callback = this._defaultCallback,
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
        this.supressErrors = supressErrors;
        this.addTimestampWithNanoSecs = addTimestampWithNanoSecs;
        this.compress = compress;
        this.internalLogger = internalLogger;
        this.sleepUntilNextRetry = sleepUntilNextRetry;

        this.timer = null;
        this.closed = false;

        this.protocol = protocol;
        this._setProtocol(port);

        /*
          Callback method executed on each bulk of messages sent to logzio.
          If the bulk failed, it will be called: callback(exception), otherwise upon
          success it will called as callback()
        */
        this.callback = callback;

        /*
         * the read/write/connection timeout in milliseconds of the outgoing HTTP request
         */
        this.timeout = timeout;

        // build the url for logging
        this.url = `${this.protocol}://${this.host}:${this.port}?token=${this.token}`;

        this.messages = [];
        this.bulkId = 1;
        this.extraFields = extraFields;
    }

    _setProtocol(port) {
        if (!protocolToPortMap[this.protocol]) {
            throw new Error(`Invalid protocol defined. Valid options are : ${JSON.stringify(Object.keys(protocolToPortMap))}`);
        }
        this.port = port || protocolToPortMap[this.protocol];

        if (this.protocol === 'udp') {
            this.udpClient = dgram.createSocket('udp4');
        }
    }

    _defaultCallback(err) {
        if (err && !this.supressErrors) {
            this.internalLogger.log(`logzio-logger error: ${err}`, err);
        }
    }

    sendAndClose(callback) {
        this.callback = callback || this._defaultCallback;
        this._debug('Sending last messages and closing...');
        this._popMsgsAndSend();
        clearTimeout(this.timer);

        if (this.protocol === 'udp') {
            this.udpClient.close();
        }
    }

    _timerSend() {
        if (this.messages.length > 0) {
            this._debug(`Woke up and saw ${this.messages.length} messages to send. Sending now...`);
            this._popMsgsAndSend();
        }

        this.timer = setTimeout(() => {
            this._timerSend();
        }, this.sendIntervalMs);
    }

    _sendMessagesUDP() {
        const udpSentCallback = (err) => {
            if (err) {
                this._debug(`Error while sending udp packets. err = ${err}`);
                this.callback(new Error(`Failed to send udp log message. err = ${err}`));
            }
        };

        this.messages.forEach((message) => {
            const msg = message;
            msg.token = this.token;
            const buff = Buffer.from(stringifySafe(msg));

            this._debug('Starting to send messages via udp.');
            this.udpClient.send(buff, 0, buff.length, this.port, this.host, udpSentCallback);
        });
    }

    close() {
        // clearing the timer allows the node event loop to quit when needed
        clearTimeout(this.timer);

        // send pending messages, if any
        if (this.messages.length > 0) {
            this._debug('Closing, purging messages.');
            this._popMsgsAndSend();
        }

        if (this.protocol === 'udp') {
            this.udpClient.close();
        }

        // no more logging allowed
        this.closed = true;
    }

    /**
     * Attach a timestamp to the log record.
     * If @timestamp already exists, use it. Else, use current time.
     * The same goes for @timestamp_nano
     * @param msg - The message (Object) to append the timestamp to.
     * @private
     */
    _addTimestamp(msg) {
        const now = (new Date()).toISOString();
        msg['@timestamp'] = msg['@timestamp'] || now;

        if (this.addTimestampWithNanoSecs) {
            const time = process.hrtime();
            msg['@timestamp_nano'] = msg['@timestamp_nano'] || [now, time[0].toString(), time[1].toString()].join('-');
        }
    }

    log(msg) {
        if (this.closed === true) {
            throw new Error('Logging into a logger that has been closed!');
        }
        if (typeof msg === 'string') {
            msg = {
                message: msg,
            };
        }
        msg = assign(msg, this.extraFields);
        if (!msg.type) {
            msg.type = this.type;
        }
        this._addTimestamp(msg);

        this.messages.push(msg);
        if (this.messages.length >= this.bufferSize) {
            this._debug('Buffer is full - sending bulk');
            this._popMsgsAndSend();
        }
    }

    _popMsgsAndSend() {
        if (this.protocol === 'udp') {
            this._debug('Sending messages via udp');
            this._sendMessagesUDP();
        } else {
            const bulk = this._createBulk(this.messages);
            this._debug(`Sending bulk #${bulk.id}`);
            this._send(bulk);
        }

        this.messages = [];
    }

    _createBulk(msgs) {
        const bulk = {};
        // creates a new copy of the array. Objects references are copied (no deep copy)
        bulk.msgs = msgs.slice();
        bulk.attemptNumber = 1;
        bulk.sleepUntilNextRetry = this.sleepUntilNextRetry;
        bulk.id = this.bulkId; // TODO test
        this.bulkId += 1;

        return bulk;
    }

    _debug(msg) {
        if (this.debug) this.internalLogger.log(`logzio-nodejs: ${msg}`);
    }

    _tryAgainIn(sleepTimeMs, bulk) {
        this._debug(`Bulk #${bulk.id} - Trying again in ${sleepTimeMs}[ms], attempt no. ${bulk.attemptNumber}`);
        setTimeout(() => {
            this._send(bulk);
        }, sleepTimeMs);
    }

    _send(bulk) {
        const body = messagesToBody(bulk.msgs);
        const options = {
            uri: this.url,
            headers: {
                host: this.host,
                accept: '*/*',
                'user-agent': USER_AGENT,
                'content-type': 'text/plain',
            },
        };

        if (typeof this.timeout !== 'undefined') {
            options.timeout = this.timeout;
        }

        return Promise.resolve()
            .then(() => {
                if (this.compress) {
                    options.headers['content-encoding'] = 'gzip';
                    return zlibPromised(body);
                }
                return body;
            })
            .then((finalBody) => {
                options.body = finalBody;
                this._tryToSend(options, bulk);
            });
    }

    _tryToSend(options, bulk) {
        return request.post(options)
            .then(() => {
                this._debug(`Bulk #${bulk.id} - sent successfully`);
                this.callback();
            })
            .catch((err) => {
                // In rare cases server is busy
                const errorCode = err.cause && err.cause.code;
                if (UNAVAILABLE_CODES.includes(errorCode)) {
                    if (bulk.attemptNumber >= this.numberOfRetries) {
                        return this.callback(new Error(`Failed after ${bulk.attemptNumber} retries on error = ${err}`), bulk);
                    }
                    this._debug(`Bulk #${bulk.id} - failed on error: ${err}`);
                    const sleepTimeMs = bulk.sleepUntilNextRetry;
                    bulk.sleepUntilNextRetry *= 2;
                    bulk.attemptNumber += 1;

                    return this._tryAgainIn(sleepTimeMs, bulk);
                }

                if (err.statusCode !== 200) {
                    return this.callback(new Error(`There was a problem with the request.\nResponse: ${err.statusCode}: ${err.message}`), bulk);
                }

                return this.callback(err, bulk);
            });
    }
}

const createLogger = (options) => {
    const l = new LogzioLogger(options);
    l._timerSend();
    return l;
};


module.exports = {
    jsonToString,
    createLogger,
};
