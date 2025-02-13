"use strict";

/**
 * An pending communication object
 * @class
 */
const Message = class {
    //for inner usage
    packetSize;
    packetTimeout;
    packetRetry;
    sendThreads;

    onreceive = function() {};
    packetCallbacks = new Map();
    onaborts = new Set();
    onFinish = function() {};

    messageId;
    timeoutId = -1;
    interactTimeoutId = -1;
    isAnswer = false;
    answerFor = 0;
    packetCount = Infinity;
    packets = new Map();
    process;

    constructor() {

    };

    //
    //public API methods
    //
    //events
    onprogress = function(message) {};

    //methods
    progress = 0;
    error = "";
    data;
    isInvoke = false;
    send = undefined;
    invoke = undefined;
    abort() {
        this.error = "abort";
        for (const cb of this.onaborts) {
            cb();
        }
    };
    async wait() {
        return this.process;
    };
};

/**
 * Communication channel object
 * @class
 */
const Communicator = class {
    UID = 1; //random positive number to decide the side
    sender = async function(data, transfer) {}; //sender function
    interactTimeout = 5000; //cancel if not happen any transmission in time

    timeout = 5000; //the whole invoke process time limit
    packetSize = 16384; //max size of each packet
    packetTimeout = 1000; //timeout for packet acknowledgment
    packetRetry = Infinity; //retry attemts number for one packets
    sendThreads = 16; //packets that can be sent in same time

    timeOffset = 0;
    timeSyncIntervalId = -1;
    timePromise;
    timeResolve;

    sidePromise;
    sideResolve;

    messageId = 0;
    myReminder = 0;
    messages = new Map();

    ERROR_TIMEOUT = "timeout"; // when run out of the time
    ERROR_INACTIVE = "inactive"; // when no answer for long time
    ERROR_ABORT = "abort"; // local abort
    ERROR_REJECT = "reject"; // remote abort
    ERROR_TRANSFER_SEND = "send"; // cannot send
    ERROR_TRANSFER_RECEIVE = "receive"; // answer not arrived

    onincoming = function(message) {};
    onsend = function(data) {};
    oninvoke = function(message) {};

    

    // methods: send, invoke, receive,
    // events: onincoming, onsend, oninvoke
    // methods (process):  abort, wait, send, invoke
    // events (process):  progress
    constructor(config) {
        this.configure(config);
    };
    configure(config) {
        //set variables
        if (typeof config !== "object") {
            throw new Error("Configuration needs to be an object.");
        }

        //set required params and static params
        if (typeof config["sender"] !== "undefined") {
            if (typeof config["sender"] === "function") {
                this.sender = config["sender"];
            } else {
                throw new Error("'sender' option must be function");
            }
        }

        //set optional and static params
        if (typeof config["interactTimeout"] !== "undefined") {
            if (typeof config["interactTimeout"] === "number") {
                this.interactTimeout = config["interactTimeout"];
            } else {
                throw new Error("'interactTimeout' option must be number");
            }
        }

        //set optional params
        if (typeof config["timeout"] !== "undefined") {
            if (typeof config["timeout"] === "number") {
                this.timeout = config["timeout"];
            } else {
                throw new Error("'timeout' option must be number");
            }
        }
        if (typeof config["packetSize"] !== "undefined") {
            if (typeof config["packetSize"] === "number") {
                this.packetSize = config["packetSize"];
            } else {
                throw new Error("'packetSize' option must be number");
            }
        }
        if (typeof config["packetTimeout"] !== "undefined") {
            if (typeof config["packetTimeout"] === "number") {
                this.packetTimeout = config["packetTimeout"];
            } else {
                throw new Error("'packetRetry' option must be number");
            }
        }
        if (typeof config["packetRetry"] !== "undefined") {
            if (typeof config["packetRetry"] === "number") {
                this.packetRetry = config["packetRetry"];
            } else {
                throw new Error("'packetRetry' option must be number");
            }
        }
        if (typeof config["sendThreads"] !== "undefined") {
            if (typeof config["sendThreads"] === "number") {
                this.sendThreads = config["sendThreads"];
            } else {
                throw new Error("'sendThreads' option must be number");
            }
        }

        //initial setup
        this.UID = Math.floor(Math.random() * 4294967294) + 1; // betwwen 1 and (32 bit-1)
    };
    release() {
        //free up every pointer that point to non internal variables
        this.sender = async function(data, transfer) {};
        this.messages = new Map();
    };


    TimeSyncStart(resyncTime = 60000) {
        this.TimeSyncStop();
        this.SyncTime();
        this.timeSyncIntervalId = setInterval(() => {
            this.SyncTime();
        }, resyncTime);
    };
    TimeSyncStop() {
        clearInterval(this.timeSyncIntervalId);
    };
    async TimeSync(retry = 5, patience = this.interactTimeout) {
        //check runnig request
        if (this.timePromise !== undefined) {
            return this.timePromise;
        }

        //start request
        this.timePromise = this.TimeSyncRaw(retry, patience);
        const isSuccess = await this.timePromise;
        this.timePromise = undefined;
        return isSuccess;
    };
    async TimeSyncRaw(retry, patience) {
        let isSuccess = false;
        let trying = 0;
        do {
            trying++;

            isSuccess = await new Promise((resolve) => {
                this.TimeSyncResolve(resolve, patience);

                //send
                const buffer = new ArrayBuffer(17);
                const view = new DataView(buffer);
                view.setUint8(view.byteLength - 1, 1); //time sync flag
                view.setFloat64(view.byteLength - 9, Date.now()); //my time
                view.setFloat64(view.byteLength - 17, -1); //other time
                this.sender(buffer, [buffer]);
            });
        } while (trying < retry && isSuccess === false);

        if (isSuccess === false) {
            isSuccess = await new Promise((resolve) => {
                this.TimeSyncResolve(resolve, this.interactTimeout);
            });
        }

        return isSuccess;
    };
    TimeSyncResolve(resolve, patience) {
        //timeout
        const timeout = setTimeout(() => {
            this.timeResolve = undefined;
            resolve(false);
        }, patience);

        //callback
        this.timeResolve = () => {
            this.timeResolve = undefined;
            clearTimeout(timeout);
            resolve(true);
        };
    };

    async SideSync(retry = 5, patience = this.interactTimeout) {
        //check runnig request
        if (this.sidePromise !== undefined) {
            return this.sidePromise;
        }

        //start request
        this.sidePromise = this.SideSyncRaw(retry, patience);
        const isSuccess = await this.sidePromise;
        this.sidePromise = undefined;
        return isSuccess;
    };
    async SideSyncRaw(retry, patience) {
        let isSuccess = false;
        let trying = 0;
        do {
            trying++;
            isSuccess = await new Promise((resolve) => {
                this.SideSyncResolve(resolve, patience);

                //send
                const buffer = new ArrayBuffer(13);
                const view = new DataView(buffer);
                view.setUint8(view.byteLength - 1, 2); //side sync flag
                view.setUint32(view.byteLength - 5, Date.now() % 4294967295); //my time
                view.setUint32(view.byteLength - 9, this.UID); //my UID
                view.setUint32(view.byteLength - 13, 0); //other UID
                this.sender(buffer, [buffer]);
            });
        } while (trying < retry && isSuccess === false);

        if (isSuccess === false) {
            isSuccess = await new Promise((resolve) => {
                this.SideSyncResolve(resolve, this.interactTimeout);
            });
        }

        return isSuccess;
    };
    SideSyncResolve(resolve, patience) {
        //timeout
        const timeout = setTimeout(() => {
            this.sideResolve = undefined;
            resolve(false);
        }, patience);

        //callback
        this.sideResolve = (otherUID) => {
            this.sideResolve = undefined;
            clearTimeout(timeout);

            if (otherUID === this.UID) {
                //console.log("UID", this.UID, otherUID);
                this.UID = Math.floor(Math.random() * 4294967294) + 1; // betwwen 1 and (32 bit-1)
                resolve(false);
            } else {
                //console.log("UID", this.UID, otherUID);
                this.myReminder = (this.UID > otherUID ? 1 : 0);
                this.messageId = this.myReminder;
                resolve(true);
            }

        };
    };


    send(msg, transfer = [], timeout, options) {
        //create
        const messageObj = this.MessageCreate();

        //set params
        this.MessageSet(messageObj, options, false);

        //create pending process
        messageObj.process = this.sendRaw(messageObj, msg, transfer, timeout);

        return messageObj;
    };
    async sendRaw(messageObj, msg, transfer, timeout) {
        //prevent recalling
        messageObj.send = undefined;
        messageObj.invoke = undefined;

        //timeout abort
        if (typeof timeout !== "number") {
            timeout = this.timeout;
        }
        messageObj.timeoutId = setTimeout(() => {
            messageObj.error = this.ERROR_TIMEOUT;
            for (const cb of messageObj.onaborts) {
                cb();
            }
        }, timeout);

        //send data
        await this.MessageSend(messageObj, msg, transfer);
        this.MessageFree(messageObj);

        return messageObj;
    };
    invoke(msg, transfer = [], timeout, options) {
        //create
        const messageObj = this.MessageCreate();

        //set params
        this.MessageSet(messageObj, options, true);

        //create pending process
        messageObj.process = this.invokeRaw(messageObj, msg, transfer, timeout);

        return messageObj;
    };
    async invokeRaw(messageObj, msg, transfer, timeout) {
        return new Promise((resolve) => {
            //prevent recalling
            messageObj.send = undefined;
            messageObj.invoke = undefined;

            //timeout abort
            if (typeof timeout !== "number") {
                timeout = this.timeout;
            }
            messageObj.timeoutId = setTimeout(() => {
                messageObj.error = this.ERROR_TIMEOUT;
                for (const cb of messageObj.onaborts) {
                    cb();
                }
            }, timeout);

            //exit if error
            messageObj.onaborts.add(() => {
                console.log("aborted");
                console.log(messageObj.error);
                this.MessageFree(messageObj);
                resolve([messageObj.error, messageObj.data, messageObj.isInvoke]);
            });

            //or exit if invoke finish
            messageObj.onFinish = () => {
                this.MessageFree(messageObj);
                messageObj.send = (msg, transfer, timeout, options) => {
                    this.MessageSet(messageObj, options, false);
                    messageObj.process = this.sendRaw(messageObj, msg, transfer, timeout);
                };
                messageObj.invoke = (msg, transfer, timeout, options) => {
                    this.MessageSet(messageObj, options, true);
                    console.log("a");
                    messageObj.process = this.invokeRaw(messageObj, msg, transfer, timeout);
                };
                resolve([messageObj.error, messageObj.data, messageObj.isInvoke]);
            };

            //send data
            this.MessageSend(messageObj, msg, transfer);
        });
    }


    async receive(msg) {
        //1bit time sync request flag
        //1bit side sync request flag
        //1bit invoke flag
        //1bit split flag
        //1bit abort flag
        //1bit answer flag
        //2bit unused

        //my time - 64bit float timestamp (only time sync)
        //other time - 64bit float timestamp (only time sync)

        //my time - 32bit uint (only side sync)
        //my UID - 32bit uint (only side sync)
        //other UID - 32bit uint (only side sync)

        //32bit send time
        //32bit message id
        //16bit packet id (split)
        //16bit packet count (split, first)
        //32bit answer for (answer flag)

        //data...

        //mandaory header
        let isTimeSync = false;
        let isSideSync = false;
        let isInvoke = false;
        let isSplit = false;
        let isAbort = false;
        let isAnswer = false;

        //time header
        let time1 = 0;
        let time2 = 0;

        //side header
        let time = 0;
        let UID1 = 0;
        let UID2 = 0;

        //message header
        let sendTime = 0;
        let messageId = 0;
        let packetId = 0;
        let packetCount = 1;
        let answerFor = 0;

        //data
        let data;

        //read from different types
        if (msg instanceof Array && msg.length > 1) {
            //handle 1st layer
            let offset = 0;
            const h = msg[offset++];
            isTimeSync = ((h & 1) !== 0 ? true : false); //get time sync request
            isSideSync = ((h & 2) !== 0 ? true : false); //get side sync request

            //handle 2nd layer
            if (isTimeSync) {
                time1 = msg[offset++];
                time2 = msg[offset++];

            } else if (isSideSync) {
                time = msg[offset++];
                UID1 = msg[offset++];
                UID2 = msg[offset++];

            } else {
                isInvoke = ((h & 4) !== 0 ? true : false); //get invoke flag
                isSplit = ((h & 8) !== 0 ? true : false); //get split flag
                isAbort = ((h & 16) !== 0 ? true : false); //get abort flag
                isAnswer = ((h & 32) !== 0 ? true : false); //get answer flag
                sendTime = msg[offset++]; //get send time
                messageId = msg[offset++]; //get message id
                if (isSplit) {
                    packetId = msg[offset++]; //get packet id
                    if (packetId === 0) {
                        packetCount = msg[offset++]; //get packet count
                    }
                }
                if (isAnswer) {
                    answerFor = msg[offset++]; //get answer for
                }
                data = msg[offset++]; //get data
            }

        } else if (msg instanceof ArrayBuffer && msg.byteLength > 0) {
            //handle 1st layer
            let offset = 0;
            const view = new DataView(msg);
            offset += 1;
            let h = view.getUint8(msg.byteLength - offset);
            isTimeSync = ((h & 1) !== 0 ? true : false); //get time sync request
            isSideSync = ((h & 2) !== 0 ? true : false); //get side sync request

            //handle 2nd layer
            if (isTimeSync) {
                offset += 8;
                time1 = view.getFloat64(view.byteLength - offset);
                offset += 8;
                time2 = view.getFloat64(view.byteLength - offset);

            } else if (isSideSync) {
                offset += 4;
                time = view.getUint32(view.byteLength - offset);
                offset += 4;
                UID1 = view.getUint32(view.byteLength - offset);
                offset += 4;
                UID2 = view.getUint32(view.byteLength - offset);

            } else {
                isInvoke = ((h & 4) !== 0 ? true : false); //get invoke flag
                isSplit = ((h & 8) !== 0 ? true : false); //get split flag
                isAbort = ((h & 16) !== 0 ? true : false); //get abort flag
                isAnswer = ((h & 32) !== 0 ? true : false); //get answer flag

                offset += 4;
                sendTime = view.getUint32(view.byteLength - offset); //get send time
                offset += 4;
                messageId = view.getUint32(view.byteLength - offset); //get message id
                if (isSplit) {
                    offset += 2;
                    packetId = view.getUint16(view.byteLength - offset); //get packet id
                    if (packetId === 0 && messageId % 2 !== this.myReminder) {
                        offset += 2;
                        packetCount = view.getUint16(view.byteLength - offset); //get packet count
                    }
                }
                if (isAnswer) {
                    offset += 4;
                    answerFor = view.getUint32(view.byteLength - offset); //get answer for
                }
                data = msg.transfer(msg.byteLength - offset); //get data


            }

        } else {
            console.warn("Wrong format incoming", msg);
            return;
        }

        // handle time sync packets
        if (isTimeSync) {
            //recive others request
            if (time2 === -1) {
                const buffer = new ArrayBuffer(25);
                const view = new DataView(buffer);
                view.setUint8(view.byteLength - 1, 1);
                view.setFloat64(view.byteLength - 9, time1);
                view.setFloat64(view.byteLength - 17, Date.now());
                this.sender(buffer, [buffer]);
                return;
            }

            //recive my request
            const returnTime = Date.now() - time1;
            if (returnTime > this.interactTimeout || this.timeResolve === undefined) {
                return;
            }
            const timeOffset = (time2 + (returnTime / 2)) - Date.now();
            //console.log(timeOffset);
            this.timeOffset = timeOffset;
            this.timeResolve();
            return;
        }

        // handle side sync packets
        if (isSideSync) {
            //recive others request
            if (UID2 === 0) {
                const buffer = new ArrayBuffer(25);
                const view = new DataView(buffer);
                view.setUint8(view.byteLength - 1, 2);
                view.setUint32(view.byteLength - 5, time);
                view.setUint32(view.byteLength - 9, UID1);
                view.setUint32(view.byteLength - 13, this.UID);
                this.sender(buffer, [buffer]);
                return;
            }

            //recive my request
            const now = Date.now() % 4294967295 - 100;
            if (time < now || now - time > this.interactTimeout || UID1 !== this.UID) {
                return;
            }
            //console.log("uid", UID1, UID2);
            this.sideResolve(UID2);
            return;
        }

        // delete outdated packets
        const now = Date.now() % 4294967295 - 100;
        if (sendTime < now || now - sendTime > this.interactTimeout) {
            return;
        }

        // my packets
        if (messageId % 2 === this.myReminder) {
            this.receiveMy(isAbort, messageId, packetId);
            return;
        }

        // other packets
        this.receiveOther(isInvoke, isSplit, isAbort, isAnswer, messageId, packetId, packetCount, answerFor, data);
    };
    async receiveMy(isAbort, messageId, packetId) {
        //get relevant object
        const messageObj = this.messages.get(messageId);

        //exit if not exist
        if (messageObj === undefined) {
            return;
        }

        //call the listening message
        messageObj.onreceive(isAbort, packetId);
        return;
    };
    async receiveOther(isInvoke, isSplit, isAbort, isAnswer, messageId, packetId, packetCount, answerFor, data) {
        // load message object
        let messageObj = this.messages.get(messageId);

        // solve if not exist
        if (messageObj === undefined) {
            if (isAnswer) {
                console.log(isAnswer);
                // check the parent object (and not moved yet)
                messageObj = this.messages.get(answerFor);

                // exit if no parent
                if (messageObj === undefined) {
                    return;
                }

                // move message object
                messageObj.messageId = messageId;
                messageObj.isInvoke = (isInvoke === 1 ? true : false);
                messageObj.isAnswer = true;
                messageObj.packets = new Map();
                this.messages.delete(answerFor);
                this.messages.set(messageId, messageObj);

                // todo: trigger incoming answer
                //trigger incoming event
                messageObj.onincoming?.(messageObj);

            } else {
                //create new object
                messageObj = new Message();
                messageObj.messageId = messageId;
                messageObj.isInvoke = isInvoke;
                this.messages.set(messageId, messageObj);

                //create wait function
                messageObj.process = new Promise((resolve) => {
                    messageObj.onaborts.add(() => {
                        resolve([messageObj.error, messageObj.data, messageObj.isInvoke]);
                    });

                    //or exit if invoke finish
                    messageObj.onFinish = () => {
                        resolve([messageObj.error, messageObj.data, messageObj.isInvoke]);
                    };
                });
                //trigger incoming event
                this.onincoming?.(messageObj);
            }
        }

        //refresh interactivity
        clearTimeout(messageObj.interactTimeoutId);
        messageObj.interactTimeoutId = setTimeout(() => {
            messageObj.error = this.ERROR_INACTIVE;
            for (const cb of messageObj.onaborts) {
                cb();
            }
            messageObj?.onFinish?.();
            this.MessageFree(messageObj);
        }, this.interactTimeout);

        //abort
        if (isAbort) {
            return;
        }

        //set data
        if (packetId === 0) {
            //first chunk
            messageObj.packetCount = packetCount;
        }
        messageObj.packets.set(packetId, data);
        //console.log(packetId, data);


        //send ack
        const sendTime = (Date.now() + this.timeOffset) % 4294967295; //32 bit time
        const ack = new ArrayBuffer(11);
        const view = new DataView(ack);
        view.setUint32(view.byteLength - 5, sendTime);
        view.setUint32(view.byteLength - 9, messageId);
        if (isSplit) {
            view.setUint8(view.byteLength - 1, (isSplit ? 8 : 0));
            view.setUint16(view.byteLength - 11, packetId);
        }
        this.sender(ack, [ack]);

        //check finish
        if (messageObj.packetCount === messageObj.packets.size) {
            const firstPacket = messageObj.packets.get(0);
            if (firstPacket instanceof ArrayBuffer) {
                //calc max message size
                let size = 0;
                const it = messageObj.packets[Symbol.iterator]();
                for (const [key, value] of it) {
                    size += value.byteLength;
                }
                const data = new Uint8Array(size);

                //copy packets data
                const it2 = messageObj.packets[Symbol.iterator]();
                let offset = 0;
                for (const [key, value] of it2) {
                    data.set(new Uint8Array(value), offset);
                    offset += value.byteLength;
                }
                messageObj.data = data.buffer;
            } else {
                messageObj.data = firstPacket;
            }
            //console.log(new Uint8Array(messageObj.data))
            //console.log(messageObj.isAnswer);

            //callback (if new)
            if (messageObj.isAnswer === false) {
                if (messageObj.isInvoke) {
                    messageObj.send = (msg, transfer, timeout = messageObj.timeout, options) => {

                        this.MessageSet(messageObj, options, false);
                        messageObj.process = this.sendRaw(messageObj, msg, transfer, timeout);
                    };
                    messageObj.invoke = (msg, transfer, timeout, options) => {
                        this.MessageSet(messageObj, options, true);
                        messageObj.process = this.invokeRaw(messageObj, msg, transfer, timeout);
                    };
                    this.oninvoke?.(messageObj);
                } else {
                    this.onsend?.(messageObj.data);
                }
            } else {
                //todo need answer triggering
                if (messageObj.isInvoke) {
                    messageObj.send = (msg, transfer, timeout = messageObj.timeout, options) => {
                        this.MessageSet(messageObj, options, false);
                        messageObj.process = this.sendRaw(messageObj, msg, transfer, timeout);
                    };
                    messageObj.invoke = (msg, transfer, timeout = messageObj.timeout, options) => {
                        this.MessageSet(messageObj, options, true);
                        messageObj.process = this.invokeRaw(messageObj, msg, transfer, timeout);
                    };
                    messageObj.oninvoke?.(messageObj);
                } else {
                    messageObj.onsend?.(messageObj.data);
                }
            }
            //callback
            messageObj?.onFinish?.();
            this.MessageFree(messageObj);
        }
    };


    MessageCreate() {
        //get unique message id
        do {
            this.messageId = (this.messageId + 2) % 4294967294; // 32 bit-1
        } while (this.messages.has(this.messageId));
        const messageId = this.messageId;

        //setup object on the global stack
        const messageObj = new Message();

        messageObj.messageId = messageId;
        this.messages.set(messageId, messageObj);
        return messageObj;
    };
    MessageSet(messageObj, options, isInvoke) {
        //set sending params
        let packetSize;
        let packetTimeout;
        let packetRetry;
        let sendThreads;
        if (typeof options === "object") {
            if ("packetSize" in options) {
                packetSize = options["packetSize"];
            }
            if ("packetTimeout" in options) {
                packetTimeout = options["packetTimeout"];
            }
            if ("packetRetry" in options) {
                packetRetry = options["packetRetry"];
            }
            if ("sendThreads" in options) {
                sendThreads = options["sendThreads"];
            }
        }
        if (packetSize === undefined) {
            packetSize = this.packetSize;
        }
        if (packetTimeout === undefined) {
            packetTimeout = this.packetTimeout;
        }
        if (packetRetry === undefined) {
            packetRetry = this.packetRetry;
        }
        if (sendThreads === undefined) {
            sendThreads = this.sendThreads;
        }
        messageObj.packetSize = packetSize;
        messageObj.packetTimeout = packetTimeout;
        messageObj.packetRetry = packetRetry;
        messageObj.sendThreads = sendThreads;

        //set invoke
        messageObj.isInvoke = isInvoke;

        //set answer (if need)
        if (messageObj.messageId % 2 !== this.myReminder) {
            messageObj.isAnswer = true;
            messageObj.answerFor = messageObj.messageId;
            //get unique message id
            do {
                this.messageId = (this.messageId + 2) % 4294967294; // 32 bit-1
            } while (this.messages.has(this.messageId));
            const messageId = this.messageId;

            this.messages.delete(messageObj.messageId);
            messageObj.messageId = messageId;
            this.messages.set(messageObj.messageId, messageObj);
        }
    };
    async MessageSend(messageObj, msg, transfer) {
        //initial interactivity
        const abort = () => {
            messageObj.error = this.ERROR_INACTIVE;
            for (const cb of messageObj.onaborts) {
                cb();
            }
        };
        clearTimeout(messageObj.interactTimeoutId);
        messageObj.interactTimeoutId = setTimeout(abort, this.interactTimeout);

        //message listener
        messageObj.onreceive = (isAbort, packetId) => {
            //update interactivity
            clearTimeout(messageObj.interactTimeoutId);
            messageObj.interactTimeoutId = setTimeout(abort, this.interactTimeout);

            //check abort
            if (isAbort) {
                messageObj.error = this.ERROR_REJECT;
                for (const cb of messageObj.onaborts) {
                    cb();
                }
                return;
            }

            //packet callback
            const cb = messageObj.packetCallbacks.get(packetId);
            cb?.();
        };

        //setup flags
        const invokeFlag = (messageObj.isInvoke ? 4 : 0);
        const answerFlag = (messageObj.isAnswer ? 32 : 0);

        //sending
        if (msg instanceof ArrayBuffer) {
            //general data
            const packetSize = messageObj.packetSize;
            const threadCount = messageObj.sendThreads;
            let generalOverhead = 9; // mandatory header size (every packet)
            const answerOverhead = (messageObj.isAnswer ? 4 : 0); // answer header size

            if (msg.byteLength + generalOverhead + answerOverhead <= packetSize) {
                const data = new Uint8Array(msg.byteLength + generalOverhead + answerOverhead);
                //copy message
                data.set(new Uint8Array(msg.transfer()), 0);
                //set headers
                const view = new DataView(data.buffer);
                view.setUint8(view.byteLength - 1, invokeFlag + answerFlag);
                view.setUint32(view.byteLength - 9, messageObj.messageId);
                if (messageObj.isAnswer) {
                    view.setUint32(view.byteLength - 13, messageObj.answerFor);
                }
                //send
                await this.MessageSendPacket(messageObj, data.buffer, [data.buffer], 0);

            } else {
                //queue logic
                let stack = new Map();
                let stackId = 0;
                const next = async function(stackId, fn) {
                    stack.set(stackId, fn);
                    await fn;
                    stack.delete(stackId);
                };
                const race = async function() {
                    return new Promise((resolve, reject) => {
                        const it = stack[Symbol.iterator]();
                        for (const [key, value] of it) {
                            value.then(resolve, reject);
                        }
                    });
                };

                //modify general header size (because split)
                const splitFlag = 8;
                generalOverhead += 2;
                const firstOverhead = 2;

                //calculate slice count (2 byte first header, 9 byte packet header, 2 byte split header)
                //first calculation (without answer headers)
                let wholeSize = msg.byteLength + firstOverhead;
                let packetCount = Math.ceil(wholeSize / (packetSize - generalOverhead));
                //calculate answer flags count
                let answerCount = Math.min(threadCount, packetCount);
                //update size and packet count (only increase)
                wholeSize += answerCount * answerOverhead; //answer headers size 
                packetCount = Math.ceil(wholeSize / (packetSize - generalOverhead));
                answerCount = Math.min(threadCount, packetCount);

                let pos = 0;
                let size = packetSize - (generalOverhead + firstOverhead + answerOverhead)
                //first packet
                {
                    const data = new Uint8Array(packetSize);
                    //copy data
                    data.set(new Uint8Array(msg.slice(pos, pos + size)), 0);
                    pos += size;
                    //set headers
                    const view = new DataView(data.buffer);
                    view.setUint8(view.byteLength - 1, invokeFlag + answerFlag + splitFlag);
                    view.setUint32(view.byteLength - 9, messageObj.messageId);
                    view.setUint16(view.byteLength - 11, stackId);
                    view.setUint16(view.byteLength - 13, packetCount);
                    if (messageObj.isAnswer) {
                        view.setUint32(view.byteLength - 17, messageObj.answerFor);
                    }
                    //send
                    next(stackId, this.MessageSendPacket(messageObj, data.buffer, [data.buffer], stackId));
                    stackId++;
                }

                //initial packets (until sendThreads full)
                size = packetSize - (generalOverhead + answerOverhead);
                while (stackId < answerCount && messageObj.error === "") {
                    const data = new Uint8Array(Math.min(size, msg.byteLength - pos) + generalOverhead + answerOverhead);
                    //copy data
                    data.set(new Uint8Array(msg.slice(pos, pos + size)), 0);
                    pos += size;
                    //set headers
                    const view = new DataView(data.buffer);
                    view.setUint8(view.byteLength - 1, invokeFlag + answerFlag + splitFlag);
                    view.setUint32(view.byteLength - 9, messageObj.messageId);
                    view.setUint16(view.byteLength - 11, stackId);
                    if (messageObj.isAnswer) {
                        view.setUint32(view.byteLength - 15, messageObj.answerFor);
                    }
                    //send
                    next(stackId, this.MessageSendPacket(messageObj, data.buffer, [data.buffer], stackId));
                    stackId++;
                }
                await race();

                //other packets (wait for free thread)
                size = packetSize - generalOverhead;
                while (stackId < packetCount && messageObj.error === "") {
                    const data = new Uint8Array(Math.min(size, msg.byteLength - pos) + generalOverhead);
                    //copy data
                    data.set(new Uint8Array(msg.slice(pos, pos + size)), 0);
                    pos += size;
                    //set headers
                    const view = new DataView(data.buffer);
                    view.setUint8(view.byteLength - 1, invokeFlag + splitFlag);
                    view.setUint32(view.byteLength - 9, messageObj.messageId);
                    view.setUint16(view.byteLength - 11, stackId);
                    //send
                    next(stackId, this.MessageSendPacket(messageObj, data.buffer, [data.buffer], stackId));
                    stackId++;
                    await race();
                }

                //wait the reamining packets
                while (stack.size !== 0 && messageObj.error === "") {
                    await race();
                }

            }
        } else {
            const data = [];
            //set headers
            data.push(invokeFlag + answerFlag);
            data.push(0);
            data.push(messageObj.messageId);
            if (messageObj.isAnswer) {
                data.push(messageObj.answerFor);
            }
            //copy message
            data.push(msg);
            //send
            await this.MessageSendPacket(messageObj, data, transfer, 0);
        }
    };
    async MessageSendPacket(messageObj, msg, transfer, packetId) {
        //params
        const retry = messageObj.packetRetry;
        const patience = messageObj.packetTimeout;
        //start sending
        let trying = 0;
        await new Promise((resolve) => {
            //free from memory
            const free = function() {
                clearTimeout(interval);
                messageObj.onaborts.delete(abort);
                messageObj.packetCallbacks.delete(packetId);
                resolve(undefined);
            };

            //success ack
            messageObj.packetCallbacks.set(packetId, () => {
                free();
            });

            //abort
            const abort = () => {
                free();
            };
            messageObj.onaborts.add(abort);

            //send
            const sending = () => {
                //abort if too much tries
                if (retry < trying) {
                    messageObj.error = this.ERROR_TRANSFER_RECEIVE;
                    for (const cb of messageObj.onaborts) {
                        cb();
                    }
                    return;
                }

                //try send
                trying++;
                const sendTime = (Date.now() + this.timeOffset) % 4294967295; //32 bit time
                if (msg instanceof ArrayBuffer) {
                    const view = new DataView(msg);
                    view.setUint32(view.byteLength - 5, sendTime);
                    this.sender(msg, transfer);
                } else {
                    msg[1] = sendTime;
                    this.sender(msg, transfer);
                }
            };
            const interval = setInterval(sending, patience);
            sending();
        });
    };
    async MessageFree(messageObj) {
        //stop timers
        clearTimeout(messageObj.timeoutId);
        clearTimeout(messageObj.interactTimeoutId);

        //waiting stucked packets
        await new Promise((resolve) => {
            setTimeout(resolve, this.interactTimeout);
        });

        //free from global stack
        this.messages.delete(messageObj.messageId);
    };


};

/**
 * Communication class for communication
 * @module Communicator
 */
export { Communicator };