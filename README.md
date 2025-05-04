![Build Status](https://travis-ci.org/logzio/logzio-nodejs.svg?branch=master)

# logzio-nodejs  
NodeJS logger for Logz.io.
The logger stashes the log messages you send into an array which is sent as a bulk once it reaches its size limit (100 messages) or time limit (10 sec) in an async fashion.
It contains a simple retry mechanism which upon connection reset (server side) or client timeout, wait a bit (default interval of 2 seconds), and try this bulk again. It does not block other messages from being accumulated and sent (async). The interval increases by a factor of 2 between each retry until it reaches the maximum allowed attempts (3).

 By default, any error is logged to the console. This can be changed by supplying a callback function.

## Before you begin you will need:
- `Nodejs` with version 14.x or above

## Sample usage
```javascript
var logger = require('logzio-nodejs').createLogger({
    token: '__YOUR_ACCOUNT_TOKEN__',
    type: 'YourLogType'     // OPTIONAL (If none is set, it will be 'nodejs')
});


// sending text
logger.log('This is a log message');

// sending an object
var obj = {
    message: 'Some log message',
    param1: 'val1',
    param2: 'val2'
};
logger.log(obj);
```

**Note:** If logzio-js is used as part of a serverless service (AWS Lambda, Azure Functions, Google Cloud Functions, etc.), add `logger.sendAndClose()` at the end of the run. For example [sync Lambda](https://github.com/logzio/logzio-nodejs/blob/master/Serverless/lambda-sync.md) and [async Lambda](https://github.com/logzio/logzio-nodejs/blob/master/Serverless/lambda-async.md)

## Options

* **token**
    Mandatory. Your account token. Look it up in the Device Config tab in Logz.io
* **type** - Log type. Help classify logs into different classifications
* **protocol** - `http`, `https` or `udp`. Default: `http`
* **host** - Destination host name. Default: `listener.logz.io`
* **port** - Destination port. Default port depends on protocol. For `udp` default port is `5050`, for `http` is `8070` and `8071` is for `https`
* **sendIntervalMs** - Time in milliseconds to wait between retry attempts. Default: `2000` (2 sec)
* **bufferSize** - The maximum number of messages the logger will accumulate before sending them all as a bulk. Default: `100`.
* **numberOfRetries** - The maximum number of retry attempts. Default: `3`
* **debug** - Should the logger print debug messages to the console? Default: `false`
* **callback**
    - A callback function called when sending a bulk of messages. The callback function is called as follows:
        - On success: `callback()`
        - On error: `callback(error)` where `error` is the Error object.
    - This function allows you to handle errors and successful transmissions differently.
* **timeout** - The read/write/connection timeout in milliseconds.
* **addTimestampWithNanoSecs** - Add a timestamp with nano seconds granularity. This is needed when many logs are sent in the same millisecond, so you can properly order the logs in kibana. The added timestamp field will be `@timestamp_nano` Default: `false`
* **compress** - If true the the logs are compressed in gzip format. Default: `false`
* **internalLogger** - set internal logger that supports the function log. Default: console.
* **extraFields** - Adds your own custom fields to each log. Add in JSON Format, for example: `extraFields : { field_1: "val_1", field_2: "val_2" , ... }`.
* **addOtelContext** - Add `trace_id`, `span_id`, `service_name` fields to logs when opentelemetry context is available.  Default: `true`


## Using UDP
A few notes are worth mentioning regarding the use of the UDP protocol:
* UDP has some limitations, and therefore it is not the recommended protocol:
  * There is no guarantee that the logs have been received.
  * UDP can't take advantage of the bulk API, so performance is sub-optimal.
* When using UDP, each message is sent separately, and not using the bulk API. This means that the meaning of `bufferSize` is slightly different in this case. The messages will still be sent separately, but the logger will wait for the buffer to reach the size specified before sending out all the messages. If you want each message to be sent out immediately, then set `bufferSize = 1`.

## Callback Usage

The `callback` option allows you to handle errors and successful transmissions when logging messages. The callback function can be used to handle different scenarios such as logging errors or confirming successful log transmissions.

### When the Callback is Called

1. **On Error**: The callback is called with an error object if there is an issue sending the log messages.
2. **On Success**: The callback is called without any arguments if the log messages are sent successfully.

### Example Usage

```javascript
var logger = require('logzio-nodejs').createLogger({
    token: '__YOUR_ACCOUNT_TOKEN__',
    type: 'YourLogType',
    callback: function(err) {
        if (err) {
            console.error('Error sending log:', err);
        } else {
            console.log('Log sent successfully');
        }
    }
});

// Sending a log message
logger.log('This is a log message');
```
### Default callback
```javascript
    _defaultCallback(err) {
        if (err && !this.supressErrors) {
            this.internalLogger.log(`logzio-logger error: ${err}`, err);
        }
    }
```

## Add opentelemetry context
If you're sending traces with OpenTelemetry instrumentation (auto or manual), you can correlate your logs with the trace context. That way, your logs will have traces data in it, such as service name, span id and trace id (version >= `2.2.0`). This feature is enabled by default, To disable it, set the `AddOtelContext` param in your handler configuration to `false`, like in this example:

```javascript
var logger = require('logzio-nodejs').createLogger({
  token: 'token',
  type: 'no-otel-context',
  addOtelContext: false
});
```

## Build and test locally
1. Clone the repository:
  ```bash
  git clone https://github.com/logzio/logzio-nodejs.git
  cd logzio-nodejs
  ```
2. Build and run tests:
  ```bash
  npm install
  npm test
  ```

## Update log
**2.3.1**
- Update dependencies:
  - `@opentelemetry/context-async-hooks` -> `^2.0.0`
  - `@opentelemetry/sdk-trace-node` -> `^2.0.0`
- Fix service name retrieval in `_addOpentelemetryContext`
- Drop support for `Node 14` 

**2.3.0**
- Add a method to flush the list of logs (@MarceloRGonc)
  
**2.2.0**
- Add `addOtelContext` configuration option:
  - `trace_id`, `span_id`, `service_name` fields to logs when opentelemetry context is available.

**2.1.8**
- Make `User-Agent` not optional and add the version to it.

**2.1.7**
- upgrade `axios` to `v1.6.4` (contributed by @gcagle3)

**2.1.6**
- Test node versions `14-20`
- upgrade `axios` to `v1.6.0` (contributed by @gcagle3)

**2.1.5**
- Add sourceIP as a new field to each log

**2.1.4**
- Replace from request to axios

**2.0.4**
- Add parameter to manage User-agent

**2.0.3**
- Add verbose logging to use in Azure serverless function

**2.0.2**
- Updated required fields for typescript

**2.0.1**
- Fixed sorting by nanosec-timestamp
- Added option to log string with an object
- Updated Typescript declaration for optional dependencies

**2.0.0**
- Added support for TypeScript
- End of support for node 6
- Upgrade dependencies due to security vulnerabilities 

<details>
  <summary markdown="span"> Expand to check old versions </summary>
 
**1.0.4 - 1.0.6**
- Upgrade dependencies due to security vulnerabilities 

**1.0.3**
- Added the bulk to the callback in case the send failed

**1.0.2**
- Handle no Error code on bad requests

**1.0.1**
- ES6
- Support node greater than node 6
- Added gzip compress option
- Added internal logger option 

**0.4.14**  
- UDP callback bug fix + tests
- UDP close connection bug fix + tests
- ESLint

**0.4.12**  
- Updated ability to add custom port

**0.4.6**  
- Updated moment (v2.19.3) and request (v2.81.0) packages 

**0.4.4**  
- `@timestamp` and `@timestamp_nano` will no longer be overriden given a custom value by the user. 

**0.4.3**  
- Add the `@timestamp` field to the logs on the client's machine (and not when it reaches the server)

**0.4.1**
- Updated `request` dependency to 2.75.0

**0.4.0**
- Fixed issue #12 - added support for UDP
- Minor refactorings

**0.3.10**
- Fixed issue #17 - sendAndClose() wasn't actually closing the timer

**0.3.9**
- Added option to add a timestamp with nano second granularity

**0.3.8**
- Updated listener url
- Added `sendAndClose()` method which immediately sends the queued messages and clears the global timer
- Added option to supress error messages

**0.3.6**
- Fixed URL for github repository in package.json

**0.3.5**
- Bug fix : upon retry (in case of network error), the message gets sent forever  

**0.3.4**
- Bug fix : `jsonToString()` was throwing an error in the catch()block  

**0.3.2**  
- Enhancement : Added option to attach extra fields to each log in a specific instance of the logger.

**0.3.1**
- Bug fix : When calling `log` with a string parameter, the object isn't constructed properly.  

</details>

