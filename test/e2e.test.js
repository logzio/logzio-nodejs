const assert = require('assert');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const logzioLogger = require('../lib/logzio-nodejs.js');
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { AsyncHooksContextManager } = require('@opentelemetry/context-async-hooks');

const LOGZIO_API_TOKEN = process.env.LOGZIO_API_TOKEN; 
const LOGZIO_LOGS_TOKEN = process.env.LOGZIO_LOGS_TOKEN;
const runE2ETests = LOGZIO_API_TOKEN && LOGZIO_LOGS_TOKEN;

/**
 * Polls the Logz.io Search API until a log with the given run_id is found, or times out.
 * @param {string} runId - Unique identifier for the test run
 * @param {string} apiToken - Logz.io API token
 * @param {number} timeout - Max seconds to poll before failing the test
 * @param {number} interval - Seconds between polling attempts
 * @returns {Promise<object>} - The found log or rejects if not found
 */
const fetchAndAssertLogs = async (runId, apiToken, timeout = 120, interval = 5) => {
  const url = "https://api.logz.io/v1/search";
  const payload = {
    query: { query_string: { query: `test_run_id:${runId}` } },
    from: 0, 
    size: 1,
    sort: [{ "@timestamp": { order: "desc" } }]
  };
  
  const headers = { 
    "Content-Type": "application/json", 
    "X-API-TOKEN": apiToken 
  };
  
  const endTime = Date.now() + (timeout * 1000);
  
  while (Date.now() < endTime) {
    try {
      const response = await axios.post(url, payload, { headers });
      const hits = response.data?.hits?.total;
      
      let hitCount = 0;
      if (typeof hits === 'object') {
        hitCount = hits?.value || 0;
      } else {
        hitCount = hits || 0;
      }
      
      if (hitCount > 0) {
        console.log(`Found ${hitCount} log(s) for run_id=${runId}`);
        return response.data.hits.hits[0]._source;
      }
    } catch (error) {
      console.error("Error polling Logz.io API:", error.message);
    }
    
    await new Promise(resolve => setTimeout(resolve, interval * 1000));
  }
  
  throw new Error(`No logs found for test_run_id=${runId} after ${timeout}s`);
};

/**
 * Setup OpenTelemetry trace context for testing
 * @returns {object} Object containing tracer and cleanup function
 */
const setupOtelContext = () => {
  const provider = new NodeTracerProvider();
  provider.register();
  
  const contextManager = new AsyncHooksContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);
  
  const tracer = trace.getTracer('logzio-test-tracer');
  
  return {
    tracer,
    cleanup: () => {
      contextManager.disable();
    }
  };
};

(runE2ETests ? describe : describe.skip)('Logzio Logger E2E Tests', () => {
  jest.setTimeout(180000); 
  it('should successfully send logs to Logz.io and validate they arrive', async () => {
    const testRunId = uuidv4();
    console.log(`Starting E2E test with test_run_id=${testRunId}`);
    
    const logger = logzioLogger.createLogger({
      token: LOGZIO_LOGS_TOKEN,
      type: 'nodejs-e2e-test',
      debug: true
    });
    
    const logMessage = {
      message: 'E2E test log message',
      test_run_id: testRunId,
      environment: 'test',
      framework: 'jest',
      timestamp: new Date().toISOString()
    };
    
    logger.log(logMessage);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    logger.close();
    
    const foundLog = await fetchAndAssertLogs(testRunId, LOGZIO_API_TOKEN);
    
    assert(foundLog.test_run_id === testRunId, 'test_run_id should match');
    assert(foundLog.message === logMessage.message, 'message should match');
    assert(foundLog.environment === 'test', 'environment should be test');
  });
  
  it('should include additional fields in the logs', async () => {
    const testRunId = uuidv4();
    console.log(`Starting E2E test for additional fields with test_run_id=${testRunId}`);
    
    const logger = logzioLogger.createLogger({
      token: LOGZIO_LOGS_TOKEN,
      type: 'nodejs-e2e-test',
      debug: true,
      extraFields: {
        service: 'logger-test',
        version: '1.0.0',
        environment: 'testing'
      }
    });
    
    const logCount = 3;
    for (let i = 0; i < logCount; i++) {
      logger.log({
        message: `E2E test log message #${i}`,
        test_run_id: testRunId,
        iteration: i
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    logger.close();
    
    const foundLog = await fetchAndAssertLogs(testRunId, LOGZIO_API_TOKEN);
    
    assert(foundLog.service === 'logger-test', 'service field should be present');
    assert(foundLog.version === '1.0.0', 'version field should be present');
    assert(foundLog.environment === 'testing', 'environment field should be present');
    assert(foundLog.test_run_id === testRunId, 'test_run_id should match');
  });

  it('should include OpenTelemetry context data in logs when addOtelContext is enabled', async () => {
    const testRunId = uuidv4();
    console.log(`Starting E2E test for OpenTelemetry context with test_run_id=${testRunId}`);
    
    const { tracer, cleanup } = setupOtelContext();
    
    const logger = logzioLogger.createLogger({
      token: LOGZIO_LOGS_TOKEN,
      type: 'nodejs-e2e-test-otel',
      debug: true,
      addOtelContext: true
    });
    
    let spanToVerify;
    await tracer.startActiveSpan('test-otel-span', async (span) => {
      spanToVerify = span;
      
      logger.log({
        message: 'E2E test log with OpenTelemetry context',
        test_run_id: testRunId,
        test_type: 'otel-context'
      });
      
      span.setAttribute('test.run_id', testRunId);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    });
    
    logger.close();
    
    cleanup();
    
    const foundLog = await fetchAndAssertLogs(testRunId, LOGZIO_API_TOKEN);
    
    assert(foundLog.test_run_id === testRunId, 'test_run_id should match');
    assert(foundLog.message === 'E2E test log with OpenTelemetry context', 'message should match');
    assert(foundLog.trace_id, 'trace_id should be present');
    assert(foundLog.span_id, 'span_id should be present');
    
    if (spanToVerify) {
      assert(foundLog.trace_id === spanToVerify.spanContext().traceId, 'trace_id should match the span context');
      assert(foundLog.span_id === spanToVerify.spanContext().spanId, 'span_id should match the span context');
    }
  });

  it('should not crash when no OpenTelemetry context data in logs and addOtelContext is enabled', async () => {
    const testRunId = uuidv4();
    console.log(`Starting E2E test for no OpenTelemetry context with test_run_id=${testRunId}`);
    
    const logger = logzioLogger.createLogger({
      token: LOGZIO_LOGS_TOKEN,
      type: 'nodejs-e2e-test-no-otel',
      debug: true,
      addOtelContext: true 
    });
    
    logger.log({
      message: 'E2E test log with addOtelContext enabled but no active span',
      test_run_id: testRunId,
      test_type: 'no-otel-context'
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    logger.close();
    
    const foundLog = await fetchAndAssertLogs(testRunId, LOGZIO_API_TOKEN);
    
    assert(foundLog.test_run_id === testRunId, 'test_run_id should match');
    assert(foundLog.message === 'E2E test log with addOtelContext enabled but no active span', 'message should match');
    assert(foundLog.test_type === 'no-otel-context', 'test_type should match');
  });
});