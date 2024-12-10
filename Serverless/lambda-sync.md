## Example on how to use logzio-nodejs inside a sync lambda

```
var logger = require('logzio-nodejs').createLogger({
  token: '<<<token>>',
  protocol: 'https',
  host: 'listener.logz.io',
  port: '8071',
  type: 'YourLogType',
  debug: true
});

exports.handler = function(event,context,callback) {
        logger.log('log1')
        logger.log('log2')
        logger.log('log3')
        logger.sendAndClose(callback)
};
```
## Usage with sendAndClose with callback
The `sendAndClose` method can accept a callback function. This method sends any remaining log messages and then closes the logger. The callback function will be called once the remaining messages are sent.

```javascript
logger.sendAndClose(function(err) {
    if (err) {
        console.error('Error sending final logs:', err);
    } else {
        console.log('Final logs sent successfully');
    }
});
```
By using the callback option, you can effectively manage and monitor the log transmission process, ensuring that you are aware of any issues or confirming successful log deliveries.