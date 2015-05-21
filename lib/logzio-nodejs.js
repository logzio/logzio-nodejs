
var request = require('request');
var stringifySafe = require('json-stringify-safe');

exports.version = require('../package.json').version;

var LogzioLogger = function (options) {
    if (!options || !options.token)
        throw new Error('You are required to supply a token for logging.');

    this.token = options.token;
    this.protocol = options.protocol || 'http';
    this.host = 'listener-http.logz.io';
    this.port = 5050;
    this.userAgent = 'Logzio-Logger NodeJS';
	this.type = 'nodejs';

    // build the url for logging
    this.url = this.protocol + '://' + this.host + ':' + this.port + '?token=' + this.token;
};
exports.createLogger = function (options) {
    return new LogzioLogger(options);
};

var jsonToString = exports.jsonToString = function(json) {
    try {
        return JSON.stringify(json);
    }
    catch(ex) {
        return stringifySafe(msg, null, null, function() { });
    }
};

LogzioLogger.prototype.log = function (msg, callback) {

    var requestBody = undefined;
    if (typeof msg === 'string') {
		var msgJson = { message: msg };
		if (this.type) msgJson.type = this.type;
		requestBody = jsonToString(msgJson);
	}
    else if (typeof msg === 'object') {
		if (!msg.type && this.type) msg.type = this.type;
		requestBody = jsonToString(msg);
	}

    var options = {
        uri: this.url,
        method: 'POST',
        body: requestBody,
        headers: {
          'host': this.host,
          'accept': '*/*',
          'user-agent': this.userAgent,
          'content-type': 'text/plain',
          'content-length': Buffer.byteLength(requestBody)
        }
    };

	callback = callback || function() {};
    try {
        request(options, function (err, res, body) {
            if (err) {
                callback(err);
                return;
            }

            var responseCode = res.statusCode.toString();
            if (responseCode !== '200')
                callback(new Error('There was a problem with the request.\nReceived http response code: ' + responseCode));

            callback();
        });
    }
    catch (ex) {
        callback(ex);
    }
};
