Example on how to use logzio-nodejs inside a sync lambda

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
