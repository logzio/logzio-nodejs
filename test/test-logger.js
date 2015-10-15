var sinon  = require('sinon');
var logzioLogger = require('../lib/logzio-nodejs.js');
var request = require('request');
var nock = require('nock');
var assert = require('assert');

var createLogger = function(options) {
    var myoptions = options;
    myoptions.token = 'acrSGIefherhsZYOpzxeGBpTyqgSzaMk';
    myoptions.type = 'testnode';
    myoptions.debug = true;
    return logzioLogger.createLogger(myoptions);
};


describe('logger', function() {
    this.timeout(25000);

    describe('#log-single-line', function () {
        before(function(done){
            sinon
                .stub(request, 'post')
                .yields(null, {statusCode: 200} , "");
            done();
        });

        after(function(done){
            request.post.restore();
            done();
        });

        it('sends log as a string', function (done) {
            var logger = createLogger({bufferSize:1, callback: done});
            sinon.spy(logger, '_createBulk');

            var logMsg = "hello there from test";
            logger.log(logMsg);
            assert(logger._createBulk.getCall(0).args[0][0].message == logMsg);

            logger._createBulk.restore();
        });

        it('sends log as a string with extra fields', function(done) {
            var logger = createLogger({
                bufferSize:1,
                callback: done,
                extraFields:{
                    extraField1: 'val1',
                    extraField2: 'val2'
                }
            });
            sinon.spy(logger, '_createBulk');

            var logMsg = "hello there from test";
            logger.log(logMsg);
            assert(logger._createBulk.getCall(0).args[0][0].extraField1 == 'val1');
            assert(logger._createBulk.getCall(0).args[0][0].extraField2 == 'val2');

            logger._createBulk.restore();
        });

        it('sends log as an object', function (done) {
            var logger = createLogger({bufferSize:1, callback: done});
            sinon.spy(logger, '_createBulk');

            var logMsg = {message: "hello there from test"};
            logger.log(logMsg);
            assert(logger._createBulk.getCall(0).args[0][0].message == logMsg.message);

            logger._createBulk.restore();
        });

        it('sends log as an object with extra fields', function(done) {
            var logger = createLogger({
                bufferSize:1,
                callback: done,
                extraFields:{
                    extraField1: 'val1',
                    extraField2: 'val2'
                }
            });
            sinon.spy(logger, '_createBulk');

            var logMsg = {message: "hello there from test"};
            logger.log(logMsg);
            assert(logger._createBulk.getCall(0).args[0][0].extraField1 == 'val1');
            assert(logger._createBulk.getCall(0).args[0][0].extraField2 == 'val2');

            logger._createBulk.restore();
        });
    });

    describe('#log-multiple-lines', function () {
        before(function(done){
            sinon
                .stub(request, 'post')
                .yields(null, {statusCode: 200} , "");
            done();
        });

        after(function(done){
            request.post.restore();
            done();
        });

        it('Send multiple lines', function (done) {
            var logger = createLogger({bufferSize:3, callback: done});
            logger.log({messge:"hello there from test", testid:2});
            logger.log({messge:"hello there from test2", testid:2});
            logger.log({messge:"hello there from test3", testid:2});
        });

        it('Send multiple bulks', function (done) {
            var timesCalled = 0;
            var expectedTimes = 2;
            function shouldBeCalledTimes() {
                timesCalled++;
                if (expectedTimes == timesCalled) done();
            }
            var logger = createLogger({bufferSize:3, callback: shouldBeCalledTimes});
            logger.log({messge:"hello there from test", testid:3});
            logger.log({messge:"hello there from test2", testid:3});
            logger.log({messge:"hello there from test3", testid:3});

            logger.log({messge:"hello there from test", testid:4});
            logger.log({messge:"hello there from test2", testid:4});
            logger.log({messge:"hello there from test3", testid:4});
        });


    });

    describe('#timers', function () {
        before(function(done){
            sinon
                .stub(request, 'post')
                .yields(null, {statusCode: 200} , "");
            done();
        });

        after(function(done){
            request.post.restore();
            done();
        });

        it('timer-send-test', function (done) {
            var timesCalled = 0;
            var expectedTimes = 2;
            function shouldBeCalledTimes() {
                timesCalled++;
                if (expectedTimes == timesCalled) done()
            }
            var logger = createLogger({bufferSize:100, sendIntervalMs:10000, callback: shouldBeCalledTimes});
            logger.log({messge:"hello there from test", testid:5});
            logger.log({messge:"hello there from test2", testid:5});
            logger.log({messge:"hello there from test3", testid:5});

            setTimeout(function(){
                for (var i = 0; i < 100; i++) {
                    logger.log({messge:"hello there from test", testid:6});
                }
            }, 11000)
        });
    });

    describe('#retries', function () {
        before(function(done){
            nock('http://listener.logz.io')
                .post('/')
                .delay(2000) // 2 seconds
                .reply(200, '');
            done();
        });

        after(function(done){
            nock.restore();
            done();
        });

        it('retry test', function (done) {
            var logger = createLogger({bufferSize:3, callback: function(e) {
                if (e) {
                    done();
                } else {
                    done("failed");
                }
            } , timeout:1});
            logger.log({messge:"hello there from test", testid:2});
            logger.log({messge:"hello there from test2", testid:2});
            logger.log({messge:"hello there from test3", testid:2});
        });
    });

    describe('#bad-request', function () {
        before(function(done){
            sinon
                .stub(request, 'post')
                .yields(null, {statusCode: 400} , "bad");
            done();
        });

        after(function(done){
            request.post.restore();
            done();
        });

        it('bad request', function (done) {
            var logger = createLogger({bufferSize:3, callback: function(err) {
                if (err) {
                    done();
                } else {
                    done("Expected an error");
                }
            }});
            logger.log({messge:"hello there from test", testid:2});
            logger.log({messge:"hello there from test2", testid:2});
            logger.log({messge:"hello there from test3", testid:2});
        });
    });

});