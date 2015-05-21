# logzio-nodejs
NodeJS logger for LogzIO


Sample usage :
```javascript
var logger = require('logzio-logger').createLogger({
    token: '__YOUR_API_TOKEN__',
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
