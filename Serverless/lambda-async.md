Example how to use logzio-nodejs inside an async lambda

```
var logger = require('logzio-nodejs').createLogger({
  token: '<<logs token>>>',
  protocol: 'https',
  host: 'listener.logz.io',
  port: '8071',
  type: 'YourLogType',
});



exports.handler = async function(event,context) {
	function sleep(ms) {
  		return new Promise(resolve => setTimeout(resolve, ms));
	}

	logger.log('log1')
  	logger.log('log2')
  	logger.log('log3')
 	logger.sendAndClose()
  	await sleep (2000)
	return context
};
```
