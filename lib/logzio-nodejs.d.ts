type CallbackFunction = (err: Error, bulk: object) => void;

interface ILoggerOptions {
    token: string;
    host?: string;
    type? : string;
    sendIntervalMs? : number;
    bufferSize? : number;
    debug? : boolean;
    numberOfRetries? : number;
    supressErrors?  : boolean;
    addTimestampWithNanoSecs? : boolean;
    compress? : boolean;
    internalLogger : object;
    protocol? : string;
    port : string;
    timeout? : number;
    sleepUntilNextRetry? : number;
    callback(err: Error, bulk: object): void;
    extraFields? : {};
}

interface ILogzioLogger extends ILoggerOptions{
    jsonToString(json: string): string;
    log(msg: string): void;
    close(): void;
    sendAndClose(callback: CallbackFunction): void;
}

export function createLogger(options: ILoggerOptions): ILogzioLogger;