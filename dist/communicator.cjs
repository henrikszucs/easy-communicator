/*! easy-communicator v1.2.0 | LGPL-3.0-only | https://github.com/henrikszucs/easy-communicator */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/communicator.js
var communicator_exports = {};
__export(communicator_exports, {
  Communicator: () => Communicator,
  default: () => communicator_default
});
module.exports = __toCommonJS(communicator_exports);
var errors = {
  NO_ERROR: "",
  // no error
  TIMEOUT: "timeout",
  // error occurs if the data transfer is not completed in time
  INACTIVE: "inactive",
  // error occurs if between the packet transfers there is no interaction
  ABORT: "abort",
  // error occurs if local side abort the process
  REJECT: "reject",
  // error occurs if other side abort the process
  TRANSFER_SEND: "send",
  // error occurs if cannot send data with sender function
  TRANSFER_RECEIVE: "receive"
  // error occurs if exceed the receive attempts number
};
var Communicator = class {
  UID = 1;
  //random positive number to decide the side
  sender = async function(data, transfer, message) {
  };
  //sender function
  interactTimeout = 5e3;
  //cancel if not happen any transmission in time
  timeout = 5e3;
  //the whole invoke process time limit
  packetSize = 16384;
  //max size of each packet
  packetTimeout = 1e3;
  //timeout for packet acknowledgment
  packetRetry = Infinity;
  //retry attemts number for one packets
  sendThreads = 16;
  //packets that can be sent in same time
  maxReceiveBytes = Infinity;
  //the most the other side's unfinished messages may hold here at once
  receiveBytes = 0;
  //what they hold now
  timeOffset = 0;
  //time offset between the sender and receiver
  timeSyncIntervalId = -1;
  //time sync interval id
  timePromise;
  //time sync promise
  timeResolve;
  //time sync callback
  sidePromise;
  //side sync promise
  sideResolve;
  //side sync callback
  messageId = 0;
  //the message id for the next message
  myReminder = 0;
  //reminder of the UID what I am
  messages = /* @__PURE__ */ new Map();
  //all messages that are in process
  onincoming = function(message) {
  };
  // trigger if incoming new message
  onsend = function(data) {
  };
  // trigger if incomed and finished new send message
  oninvoke = function(message) {
  };
  // trigger if incomed and finished new invoke message
  ERROR = errors;
  //error constants
  // Public
  // setup API: configure, release, timeSyncStart, timeSyncStop, timeSync, sideSync
  // com API: send, invoke, receive
  // trigger API: onIncoming, onSend, onInvoke
  constructor(config) {
    this.UID = Math.floor(Math.random() * 4294967294) + 1;
    this.configure(config);
  }
  configure(config) {
    if (typeof config !== "object") {
      throw new Error("Configuration needs to be an object.");
    }
    if (typeof config["sender"] !== "undefined") {
      if (typeof config["sender"] === "function") {
        this.sender = config["sender"];
      } else {
        throw new Error("'sender' option must be function");
      }
    }
    if (typeof config["interactTimeout"] !== "undefined") {
      if (typeof config["interactTimeout"] === "number") {
        this.interactTimeout = config["interactTimeout"];
      } else {
        throw new Error("'interactTimeout' option must be number");
      }
    }
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
        throw new Error("'packetTimeout' option must be number");
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
    if (typeof config["maxReceiveBytes"] !== "undefined") {
      if (typeof config["maxReceiveBytes"] === "number") {
        this.maxReceiveBytes = config["maxReceiveBytes"];
      } else {
        throw new Error("'maxReceiveBytes' option must be number");
      }
    }
    if (typeof config["timeOffset"] !== "undefined") {
      if (typeof config["timeOffset"] === "number") {
        this.timeOffset = config["timeOffset"];
      } else {
        throw new Error("'timeOffset' option must be number");
      }
    }
  }
  release() {
    clearInterval(this.timeSyncIntervalId);
    for (const [key, message] of this.messages) {
      message.abort();
    }
    this.sender = async function(data, transfer, message) {
    };
    this.messages = /* @__PURE__ */ new Map();
    this.receiveBytes = 0;
  }
  timeSyncStart(resyncTime = 6e4) {
    clearInterval(this.timeSyncIntervalId);
    this.SyncTime();
    this.timeSyncIntervalId = setInterval(() => {
      this.SyncTime();
    }, resyncTime);
  }
  timeSyncStop() {
    clearInterval(this.timeSyncIntervalId);
  }
  async timeSync(retry = 5, patience = this.interactTimeout) {
    if (this.timePromise !== void 0) {
      return this.timePromise;
    }
    this.timePromise = this.timeSyncRaw(retry, patience);
    const isSuccess = await this.timePromise;
    this.timePromise = void 0;
    return isSuccess;
  }
  async timeSyncRaw(retry, patience) {
    let isSuccess = false;
    let trying = 0;
    do {
      trying++;
      isSuccess = await new Promise((resolve) => {
        this.timeSyncResolve(resolve, patience);
        const buffer = new ArrayBuffer(25);
        const view = new DataView(buffer);
        view.setUint8(view.byteLength - 1, 1);
        view.setFloat64(view.byteLength - 9, Date.now());
        view.setFloat64(view.byteLength - 17, -1);
        this.sender(buffer, [buffer], void 0);
      });
    } while (trying < retry && isSuccess === false);
    if (isSuccess === false) {
      isSuccess = await new Promise((resolve) => {
        this.timeSyncResolve(resolve, this.interactTimeout);
      });
    }
    return isSuccess;
  }
  timeSyncResolve(resolve, patience) {
    const timeout = setTimeout(() => {
      this.timeResolve = void 0;
      resolve(false);
    }, patience);
    this.timeResolve = () => {
      this.timeResolve = void 0;
      clearTimeout(timeout);
      resolve(true);
    };
  }
  async sideSync(retry = 5, patience = this.interactTimeout) {
    if (this.sidePromise !== void 0) {
      return this.sidePromise;
    }
    this.sidePromise = this.sideSyncRaw(retry, patience);
    const isSuccess = await this.sidePromise;
    this.sidePromise = void 0;
    return isSuccess;
  }
  async sideSyncRaw(retry, patience) {
    let isSuccess = false;
    let trying = 0;
    do {
      trying++;
      isSuccess = await new Promise((resolve) => {
        this.sideSyncResolve(resolve, patience);
        const buffer = new ArrayBuffer(13);
        const view = new DataView(buffer);
        view.setUint8(view.byteLength - 1, 2);
        view.setUint32(view.byteLength - 5, Date.now() % 4294967295);
        view.setUint32(view.byteLength - 9, this.UID);
        view.setUint32(view.byteLength - 13, 0);
        this.sender(buffer, [buffer], void 0);
      });
    } while (trying < retry && isSuccess === false);
    if (isSuccess === false) {
      isSuccess = await new Promise((resolve) => {
        this.sideSyncResolve(resolve, this.interactTimeout);
      });
    }
    return isSuccess;
  }
  sideSyncResolve(resolve, patience) {
    const timeout = setTimeout(() => {
      this.sideResolve = void 0;
      resolve(false);
    }, patience);
    this.sideResolve = (otherUID) => {
      this.sideResolve = void 0;
      clearTimeout(timeout);
      if (otherUID === this.UID) {
        this.UID = Math.floor(Math.random() * 4294967294) + 1;
        resolve(false);
      } else {
        this.myReminder = this.UID > otherUID ? 1 : 0;
        this.messageId = this.myReminder;
        resolve(true);
      }
    };
  }
  send(msg, transfer = [], timeout, options) {
    const messageObj = this.messageCreate();
    this.messageSet(messageObj, options, false);
    messageObj.pending = this.sendRaw(messageObj, msg, transfer, timeout);
    return messageObj;
  }
  async sendRaw(messageObj, msg, transfer, timeout) {
    messageObj.send = void 0;
    messageObj.invoke = void 0;
    if (typeof timeout !== "number") {
      timeout = this.timeout;
    }
    clearTimeout(messageObj.timeoutId);
    messageObj.timeoutId = setTimeout(() => {
      messageObj.error = this.ERROR.TIMEOUT;
      for (const cb of messageObj.onaborts) {
        cb();
      }
    }, timeout);
    await this.messageSend(messageObj, msg, transfer);
    if (messageObj.error === this.ERROR.ABORT) {
      const sendTime = (Date.now() + this.timeOffset) % 4294967295;
      const data = new Uint8Array(9);
      const view = new DataView(data.buffer);
      view.setUint8(view.byteLength - 1, 16);
      view.setUint32(view.byteLength - 5, sendTime);
      view.setUint32(view.byteLength - 9, messageObj.messageId);
      try {
        this.sender(data.buffer, [data.buffer], messageObj);
      } catch (e) {
      }
    }
    this.messageFree(messageObj);
    return messageObj;
  }
  invoke(msg, transfer = [], timeout, options) {
    const messageObj = this.messageCreate();
    this.messageSet(messageObj, options, true);
    messageObj.pending = this.invokeRaw(messageObj, msg, transfer, timeout);
    return messageObj;
  }
  async invokeRaw(messageObj, msg, transfer, timeout) {
    return new Promise((resolve) => {
      messageObj.send = void 0;
      messageObj.invoke = void 0;
      if (typeof timeout !== "number") {
        timeout = this.timeout;
      }
      clearTimeout(messageObj.timeoutId);
      messageObj.timeoutId = setTimeout(() => {
        messageObj.error = this.ERROR.TIMEOUT;
        for (const cb of messageObj.onaborts) {
          cb();
        }
      }, timeout);
      messageObj.onaborts.add(() => {
        if (messageObj.error === this.ERROR.ABORT) {
          const sendTime = (Date.now() + this.timeOffset) % 4294967295;
          const data = new Uint8Array(9);
          const view = new DataView(data.buffer);
          view.setUint8(view.byteLength - 1, 16);
          view.setUint32(view.byteLength - 5, sendTime);
          view.setUint32(view.byteLength - 9, messageObj.messageId);
          try {
            this.sender(data.buffer, [data.buffer], messageObj);
          } catch (e) {
          }
        }
        this.messageFree(messageObj);
        resolve([messageObj.error, messageObj.data, messageObj.isInvoke]);
      });
      messageObj.onfinish = () => {
        this.messageFree(messageObj);
        messageObj.send = (msg2, transfer2, timeout2, options) => {
          this.messageSet(messageObj, options, false);
          messageObj.pending = this.sendRaw(messageObj, msg2, transfer2, timeout2);
          return messageObj;
        };
        messageObj.invoke = (msg2, transfer2, timeout2, options) => {
          this.messageSet(messageObj, options, true);
          messageObj.pending = this.invokeRaw(messageObj, msg2, transfer2, timeout2);
          return messageObj;
        };
        resolve([messageObj.error, messageObj.data, messageObj.isInvoke]);
      };
      this.messageSend(messageObj, msg, transfer);
    });
  }
  async receive(msg) {
    let isTimeSync = false;
    let isSideSync = false;
    let isInvoke = false;
    let isSplit = false;
    let isAbort = false;
    let isAnswer = false;
    let time1 = 0;
    let time2 = 0;
    let time = 0;
    let UID1 = 0;
    let UID2 = 0;
    let sendTime = 0;
    let messageId = 0;
    let packetId = 0;
    let packetCount = 1;
    let answerFor = 0;
    let data;
    if (msg instanceof Array && msg.length > 1) {
      let offset = 0;
      const h = msg[offset++];
      isTimeSync = (h & 1) !== 0 ? true : false;
      isSideSync = (h & 2) !== 0 ? true : false;
      if (isTimeSync) {
        time1 = msg[offset++];
        time2 = msg[offset++];
      } else if (isSideSync) {
        time = msg[offset++];
        UID1 = msg[offset++];
        UID2 = msg[offset++];
      } else {
        isInvoke = (h & 4) !== 0 ? true : false;
        isSplit = (h & 8) !== 0 ? true : false;
        isAbort = (h & 16) !== 0 ? true : false;
        isAnswer = (h & 32) !== 0 ? true : false;
        sendTime = msg[offset++];
        messageId = msg[offset++];
        if (isSplit) {
          console.warn("Wrong format incoming", msg);
          return;
        }
        if (isAnswer) {
          answerFor = msg[offset++];
        }
        data = msg[offset++];
      }
    } else if (msg instanceof ArrayBuffer && msg.byteLength > 0) {
      try {
        let offset = 0;
        const view = new DataView(msg);
        offset += 1;
        let h = view.getUint8(msg.byteLength - offset);
        isTimeSync = (h & 1) !== 0 ? true : false;
        isSideSync = (h & 2) !== 0 ? true : false;
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
          isInvoke = (h & 4) !== 0 ? true : false;
          isSplit = (h & 8) !== 0 ? true : false;
          isAbort = (h & 16) !== 0 ? true : false;
          isAnswer = (h & 32) !== 0 ? true : false;
          offset += 4;
          sendTime = view.getUint32(view.byteLength - offset);
          offset += 4;
          messageId = view.getUint32(view.byteLength - offset);
          if (isSplit) {
            offset += 2;
            packetId = view.getUint16(view.byteLength - offset);
            if (packetId === 0 && messageId % 2 !== this.myReminder) {
              offset += 2;
              packetCount = view.getUint16(view.byteLength - offset);
            }
          }
          if (isAnswer) {
            offset += 4;
            answerFor = view.getUint32(view.byteLength - offset);
          }
          data = msg.transfer(msg.byteLength - offset);
        }
      } catch (error) {
        console.warn("Wrong format incoming", msg);
        return;
      }
    } else {
      console.warn("Wrong format incoming", msg);
      return;
    }
    if (isTimeSync) {
      if (time2 === -1) {
        const buffer = new ArrayBuffer(25);
        const view = new DataView(buffer);
        view.setUint8(view.byteLength - 1, 1);
        view.setFloat64(view.byteLength - 9, time1);
        view.setFloat64(view.byteLength - 17, Date.now());
        this.sender(buffer, [buffer], void 0);
        return;
      }
      const returnTime = Date.now() - time1;
      if (returnTime > this.interactTimeout || this.timeResolve === void 0) {
        return;
      }
      const timeOffset = time2 + returnTime / 2 - Date.now();
      this.timeOffset = timeOffset;
      this.timeResolve();
      return;
    }
    if (isSideSync) {
      if (UID2 === 0) {
        const buffer = new ArrayBuffer(25);
        const view = new DataView(buffer);
        view.setUint8(view.byteLength - 1, 2);
        view.setUint32(view.byteLength - 5, time);
        view.setUint32(view.byteLength - 9, UID1);
        view.setUint32(view.byteLength - 13, this.UID);
        this.sender(buffer, [buffer], void 0);
        return;
      }
      const now2 = Date.now() % 4294967295 - this.interactTimeout;
      if (time < now2 || now2 - time > this.interactTimeout || UID1 !== this.UID) {
        return;
      }
      this.sideResolve?.(UID2);
      return;
    }
    const now = Date.now() % 4294967295 - this.interactTimeout;
    if (sendTime < now || now - sendTime > this.interactTimeout) {
      console.warn("outdated packet", sendTime, now);
      return;
    }
    if (messageId % 2 === this.myReminder) {
      return this.receiveMy(isAbort, messageId, packetId);
    }
    return this.receiveOther(isInvoke, isSplit, isAbort, isAnswer, messageId, packetId, packetCount, answerFor, data);
  }
  async receiveMy(isAbort, messageId, packetId) {
    const messageObj = this.messages.get(messageId);
    if (messageObj === void 0) {
      return;
    }
    messageObj.onreceive(isAbort, packetId);
    return;
  }
  async receiveOther(isInvoke, isSplit, isAbort, isAnswer, messageId, packetId, packetCount, answerFor, data) {
    let messageObj = this.messages.get(messageId);
    if (messageObj === void 0) {
      if (isAnswer) {
        messageObj = this.messages.get(answerFor);
        if (messageObj === void 0) {
          return;
        }
        const iterator1 = messageObj.onpackets[Symbol.iterator]();
        for (const [key, val] of iterator1) {
          val();
        }
        messageObj.messageId = messageId;
        messageObj.isInvoke = isInvoke;
        messageObj.isAnswer = true;
        messageObj.packetCount = Infinity;
        messageObj.packets = /* @__PURE__ */ new Map();
        this.messages.delete(answerFor);
        this.messages.set(messageId, messageObj);
        messageObj.onincoming?.(messageObj);
      } else {
        messageObj = new Message();
        messageObj.messageId = messageId;
        messageObj.isInvoke = isInvoke;
        this.messages.set(messageId, messageObj);
        messageObj.pending = new Promise((resolve) => {
          messageObj.onaborts.add(() => {
            resolve([messageObj.error, messageObj.data, messageObj.isInvoke]);
          });
          messageObj.onfinish = () => {
            resolve([messageObj.error, messageObj.data, messageObj.isInvoke]);
          };
        });
        this.onincoming?.(messageObj);
      }
    }
    if (messageObj.error !== "") {
      return;
    }
    if (isAbort) {
      messageObj.error = this.ERROR.REJECT;
      for (const cb of messageObj.onaborts) {
        cb();
      }
      return;
    }
    const count = packetId === 0 ? packetCount : messageObj.packetCount;
    let isMisplaced = count < 1 || packetId >= count;
    if (isMisplaced === false && packetId === 0) {
      for (const heldId of messageObj.packets.keys()) {
        if (heldId >= count) {
          isMisplaced = true;
          break;
        }
      }
    }
    if (isMisplaced) {
      console.warn("packet outside its message, message refused", messageId);
      this.receiveRefuse(messageObj);
      return;
    }
    const size = data instanceof ArrayBuffer ? data.byteLength : 0;
    const previous = messageObj.packets.get(packetId);
    const growth = size - (previous instanceof ArrayBuffer ? previous.byteLength : 0);
    if (this.receiveBytes + growth > this.maxReceiveBytes) {
      console.warn("receive limit reached, message refused", messageId);
      this.receiveRefuse(messageObj);
      return;
    }
    this.receiveBytes += growth;
    messageObj.receiveBytes += growth;
    clearTimeout(messageObj.interactTimeoutId);
    messageObj.interactTimeoutId = setTimeout(() => {
      messageObj.error = this.ERROR.INACTIVE;
      for (const cb of messageObj.onaborts) {
        cb();
      }
      messageObj?.onfinish?.();
      this.messageFree(messageObj);
    }, this.interactTimeout);
    if (packetId === 0) {
      messageObj.packetCount = packetCount;
    }
    messageObj.packets.set(packetId, data);
    if (messageObj.isAnswer === true) {
      messageObj.progress = 0.5 + messageObj.packets.size / messageObj.packetCount / 2;
      messageObj.onprogress?.(messageObj.progress);
    } else {
      messageObj.progress = messageObj.packets.size / messageObj.packetCount;
      messageObj.onprogress?.(messageObj.progress);
    }
    const sendTime = (Date.now() + this.timeOffset) % 4294967295;
    const ack = new ArrayBuffer(11);
    const view = new DataView(ack);
    view.setUint32(view.byteLength - 5, sendTime);
    view.setUint32(view.byteLength - 9, messageId);
    if (isSplit) {
      view.setUint8(view.byteLength - 1, isSplit ? 8 : 0);
      view.setUint16(view.byteLength - 11, packetId);
    }
    try {
      this.sender(ack, [ack], messageObj);
    } catch (e) {
      console.warn("Sender error", e);
      messageObj.error = this.ERROR.TRANSFER_SEND;
      for (const cb of messageObj.onaborts) {
        cb();
      }
      return;
    }
    if (messageObj.packetCount === messageObj.packets.size) {
      const firstPacket = messageObj.packets.get(0);
      if (firstPacket instanceof ArrayBuffer) {
        let size2 = 0;
        let packets = [];
        packets.length = messageObj.packets.size;
        const it = messageObj.packets[Symbol.iterator]();
        for (const [key, value] of it) {
          size2 += value.byteLength;
          packets[key] = value;
        }
        const data2 = new Uint8Array(size2);
        let offset = 0;
        for (const packet of packets) {
          data2.set(new Uint8Array(packet), offset);
          offset += packet.byteLength;
        }
        messageObj.data = data2.buffer;
      } else {
        messageObj.data = firstPacket;
      }
      this.receiveRelease(messageObj);
      if (messageObj.isInvoke) {
        messageObj.send = (msg, transfer, timeout = messageObj.timeout, options) => {
          this.messageSet(messageObj, options, false);
          messageObj.pending = this.sendRaw(messageObj, msg, transfer, timeout);
          return messageObj;
        };
        messageObj.invoke = (msg, transfer, timeout = messageObj.timeout, options) => {
          this.messageSet(messageObj, options, true);
          messageObj.pending = this.invokeRaw(messageObj, msg, transfer, timeout);
          return messageObj;
        };
        messageObj?.onfinish?.();
        if (messageObj.isAnswer) {
          messageObj.oninvoke?.(messageObj);
        } else {
          this.oninvoke?.(messageObj);
        }
      } else {
        messageObj?.onfinish?.();
        if (messageObj.isAnswer) {
          messageObj.onsend?.(messageObj.data);
        } else {
          this.onsend?.(messageObj.data);
        }
      }
      this.messageFree(messageObj);
    }
  }
  onSend(cb) {
    this.onsend = cb;
    return this;
  }
  onInvoke(cb) {
    this.oninvoke = cb;
    return this;
  }
  onIncoming(cb) {
    this.onincoming = cb;
    return this;
  }
  messageCreate() {
    do {
      this.messageId = (this.messageId + 2) % 4294967294;
    } while (this.messages.has(this.messageId));
    const messageId = this.messageId;
    const messageObj = new Message();
    messageObj.messageId = messageId;
    this.messages.set(messageId, messageObj);
    return messageObj;
  }
  messageSet(messageObj, options, isInvoke) {
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
    if (packetSize === void 0) {
      packetSize = this.packetSize;
    }
    if (packetTimeout === void 0) {
      packetTimeout = this.packetTimeout;
    }
    if (packetRetry === void 0) {
      packetRetry = this.packetRetry;
    }
    if (sendThreads === void 0) {
      sendThreads = this.sendThreads;
    }
    messageObj.packetSize = packetSize;
    messageObj.packetTimeout = packetTimeout;
    messageObj.packetRetry = packetRetry;
    messageObj.sendThreads = sendThreads;
    messageObj.isInvoke = isInvoke;
    messageObj.packetCount = Infinity;
    messageObj.packetDone = 0;
    messageObj.packets = /* @__PURE__ */ new Map();
    if (messageObj.messageId % 2 !== this.myReminder) {
      messageObj.isAnswer = true;
      messageObj.answerFor = messageObj.messageId;
      do {
        this.messageId = (this.messageId + 2) % 4294967294;
      } while (this.messages.has(this.messageId));
      const messageId = this.messageId;
      this.messages.delete(messageObj.messageId);
      messageObj.messageId = messageId;
      this.messages.set(messageObj.messageId, messageObj);
    }
  }
  test = 0;
  async messageSend(messageObj, msg, transfer) {
    const test = Date.now();
    const test0 = this.test;
    this.test++;
    const abort = () => {
      messageObj.error = this.ERROR.INACTIVE;
      for (const cb of messageObj.onaborts) {
        cb();
      }
    };
    clearTimeout(messageObj.interactTimeoutId);
    messageObj.interactTimeoutId = setTimeout(abort, this.interactTimeout);
    messageObj.onreceive = (isAbort, packetId) => {
      if (messageObj.error !== "") {
        return;
      }
      clearTimeout(messageObj.interactTimeoutId);
      messageObj.interactTimeoutId = setTimeout(abort, this.interactTimeout);
      if (isAbort) {
        messageObj.error = this.ERROR.REJECT;
        for (const cb2 of messageObj.onaborts) {
          cb2();
        }
        return;
      }
      const cb = messageObj.onpackets.get(packetId);
      cb?.();
    };
    const invokeFlag = messageObj.isInvoke ? 4 : 0;
    const answerFlag = messageObj.isAnswer ? 32 : 0;
    if (msg instanceof ArrayBuffer) {
      const packetSize = messageObj.packetSize;
      const threadCount = messageObj.sendThreads;
      let generalOverhead = 9;
      const answerOverhead = messageObj.isAnswer ? 4 : 0;
      if (msg.byteLength + generalOverhead + answerOverhead <= packetSize) {
        const data = new Uint8Array(msg.byteLength + generalOverhead + answerOverhead);
        data.set(new Uint8Array(msg), 0);
        const view = new DataView(data.buffer);
        view.setUint8(view.byteLength - 1, invokeFlag + answerFlag);
        view.setUint32(view.byteLength - 9, messageObj.messageId);
        if (messageObj.isAnswer) {
          view.setUint32(view.byteLength - 13, messageObj.answerFor);
        }
        messageObj.packetCount = 1;
        await this.messageSendPacket(messageObj, data.buffer, [data.buffer], 0);
      } else {
        let stack = /* @__PURE__ */ new Map();
        let stackId = 0;
        const next = async function(stackId2, fn) {
          stack.set(stackId2, fn);
          await fn;
          stack.delete(stackId2);
        };
        const race = async function() {
          return new Promise((resolve, reject) => {
            const it = stack[Symbol.iterator]();
            for (const [key, value] of it) {
              value.then(resolve, reject);
            }
          });
        };
        const splitFlag = 8;
        generalOverhead += 2;
        const firstOverhead = 2;
        let wholeSize = msg.byteLength + firstOverhead;
        let packetCount = Math.ceil(wholeSize / (packetSize - generalOverhead));
        let answerCount = Math.min(threadCount, packetCount);
        wholeSize += answerCount * answerOverhead;
        packetCount = Math.ceil(wholeSize / (packetSize - generalOverhead));
        messageObj.packetCount = packetCount;
        answerCount = Math.min(threadCount, packetCount);
        let pos = 0;
        let size = packetSize - (generalOverhead + firstOverhead + answerOverhead);
        {
          const data = new Uint8Array(packetSize);
          data.set(new Uint8Array(msg.slice(pos, pos + size)), 0);
          pos += size;
          const view = new DataView(data.buffer);
          view.setUint8(view.byteLength - 1, invokeFlag + answerFlag + splitFlag);
          view.setUint32(view.byteLength - 9, messageObj.messageId);
          view.setUint16(view.byteLength - 11, stackId);
          view.setUint16(view.byteLength - 13, packetCount);
          if (messageObj.isAnswer) {
            view.setUint32(view.byteLength - 17, messageObj.answerFor);
          }
          next(stackId, this.messageSendPacket(messageObj, data.buffer, [data.buffer], stackId));
          stackId++;
        }
        size = packetSize - (generalOverhead + answerOverhead);
        while (stackId < answerCount && messageObj.error === "") {
          const data = new Uint8Array(Math.min(size, msg.byteLength - pos) + generalOverhead + answerOverhead);
          data.set(new Uint8Array(msg.slice(pos, pos + size)), 0);
          pos += size;
          const view = new DataView(data.buffer);
          view.setUint8(view.byteLength - 1, invokeFlag + answerFlag + splitFlag);
          view.setUint32(view.byteLength - 9, messageObj.messageId);
          view.setUint16(view.byteLength - 11, stackId);
          if (messageObj.isAnswer) {
            view.setUint32(view.byteLength - 15, messageObj.answerFor);
          }
          next(stackId, this.messageSendPacket(messageObj, data.buffer, [data.buffer], stackId));
          stackId++;
        }
        await race();
        size = packetSize - generalOverhead;
        while (stackId < packetCount && messageObj.error === "") {
          const data = new Uint8Array(Math.min(size, msg.byteLength - pos) + generalOverhead);
          data.set(new Uint8Array(msg.slice(pos, pos + size)), 0);
          pos += size;
          const view = new DataView(data.buffer);
          view.setUint8(view.byteLength - 1, invokeFlag + splitFlag);
          view.setUint32(view.byteLength - 9, messageObj.messageId);
          view.setUint16(view.byteLength - 11, stackId);
          next(stackId, this.messageSendPacket(messageObj, data.buffer, [data.buffer], stackId));
          stackId++;
          await race();
        }
        while (stack.size !== 0 && messageObj.error === "") {
          await race();
        }
      }
    } else {
      const data = [];
      data.push(invokeFlag + answerFlag);
      data.push(0);
      data.push(messageObj.messageId);
      if (messageObj.isAnswer) {
        data.push(messageObj.answerFor);
      }
      messageObj.packetCount = 1;
      data.push(msg);
      await this.messageSendPacket(messageObj, data, transfer, 0);
    }
  }
  async messageSendPacket(messageObj, msg, transfer, packetId) {
    const retry = messageObj.packetRetry;
    const patience = messageObj.packetTimeout;
    let trying = 0;
    await new Promise((resolve) => {
      const free = async function() {
        messageObj.packetDone++;
        const divide = messageObj.isInvoke ? 2 : 1;
        messageObj.progress = messageObj.packetDone / messageObj.packetCount / divide;
        messageObj.onprogress?.(messageObj.progress);
        clearTimeout(interval);
        messageObj.onaborts.delete(abort);
        messageObj.onpackets.delete(packetId);
        resolve(void 0);
      };
      messageObj.onpackets.set(packetId, () => {
        free();
      });
      const abort = () => {
        free();
      };
      messageObj.onaborts.add(abort);
      const sending = async () => {
        if (retry < trying) {
          messageObj.error = this.ERROR.TRANSFER_RECEIVE;
          for (const cb of messageObj.onaborts) {
            cb();
          }
          return;
        }
        trying++;
        const sendTime = (Date.now() + this.timeOffset) % 4294967295;
        if (msg instanceof ArrayBuffer) {
          const view = new DataView(msg);
          view.setUint32(view.byteLength - 5, sendTime);
        } else {
          msg[1] = sendTime;
        }
        try {
          await this.sender(msg, transfer, messageObj);
        } catch (e) {
          messageObj.error = this.ERROR.TRANSFER_SEND;
          for (const cb of messageObj.onaborts) {
            cb();
          }
          return;
        }
      };
      const interval = setInterval(sending, patience);
      sending();
    });
  }
  async messageFree(messageObj) {
    const messageId = messageObj.messageId;
    clearTimeout(messageObj.timeoutId);
    clearTimeout(messageObj.interactTimeoutId);
    this.receiveRelease(messageObj);
    await new Promise((resolve) => {
      setTimeout(resolve, this.interactTimeout);
    });
    if (messageObj.messageId === messageId) {
      this.receiveRelease(messageObj);
    }
    this.messages.delete(messageId);
  }
  //the bytes a message held against maxReceiveBytes are free again
  receiveRelease(messageObj) {
    this.receiveBytes -= messageObj.receiveBytes;
    messageObj.receiveBytes = 0;
    messageObj.packets = /* @__PURE__ */ new Map();
  }
  //an incoming message this side will not hold: it ends here, and the other
  //side is told so it stops sending the rest
  receiveRefuse(messageObj) {
    messageObj.error = this.ERROR.ABORT;
    const sendTime = (Date.now() + this.timeOffset) % 4294967295;
    const data = new Uint8Array(9);
    const view = new DataView(data.buffer);
    view.setUint8(view.byteLength - 1, 16);
    view.setUint32(view.byteLength - 5, sendTime);
    view.setUint32(view.byteLength - 9, messageObj.messageId);
    try {
      this.sender(data.buffer, [data.buffer], messageObj)?.catch?.(function() {
      });
    } catch (e) {
    }
    for (const cb of messageObj.onaborts) {
      cb();
    }
    this.messageFree(messageObj);
  }
};
var Message = class {
  packetSize = 1e3;
  // The maximum packet size in messaging in bytes.
  packetTimeout = 2e3;
  // The maximum waiting time for packet in miliseconds.
  packetRetry = Infinity;
  // The maximum retry attempts for packets.
  sendThreads = 16;
  // The maximum parallel packet trying number.
  onreceive = function() {
  };
  // The callback function for receiving any packets.
  onpackets = /* @__PURE__ */ new Map();
  // Multiple callback functions for pending packets.
  onaborts = /* @__PURE__ */ new Set();
  // Multiple callback functions to broadcast abort event.
  onfinish = function() {
  };
  // The callback function for finish state.
  onprogress = function(progress) {
  };
  // The callback function for progress update.
  onincoming = function(message) {
  };
  // The callback function for incoming message.
  onsend = function(data) {
  };
  // The callback function for successfull incoming sending message.
  oninvoke = function(message) {
  };
  // The callback function for successfull incoming invoke message.
  messageId;
  // The unique id of the message.
  timeoutId = -1;
  // The setTimeout number id for timeout mesure.
  interactTimeoutId = -1;
  // The setTimeout number id for interactivity (timeout between packets) mesure.
  isAnswer = false;
  //Boolean to indicate that this message an remote answer or new locally created message.
  answerFor = 0;
  //If the message is an answer, this will be the message id of the parent message.
  packetCount = Infinity;
  // The total packet count of the message.
  packetDone = 0;
  // The total packet count of the message.
  packets = /* @__PURE__ */ new Map();
  // Incoming packet data in a map.
  receiveBytes = 0;
  // The bytes of those packets held against the receive limit.
  pending;
  // The sending or invoke promise.
  //public API
  progress = 0;
  // The progress of the message in 0-1 range.
  error = "";
  // The error message if any.
  data;
  // The incoming data.
  isInvoke = false;
  // True if message is invoke else the message is only send.
  send = void 0;
  invoke = void 0;
  onProgress(cb) {
    this.onprogress = cb;
    return this;
  }
  onIncoming(cb) {
    this.onincoming = cb;
    return this;
  }
  onSend(cb) {
    this.onsend = cb;
    return this;
  }
  onInvoke(cb) {
    this.oninvoke = cb;
    return this;
  }
  abort() {
    this.error = errors.ABORT;
    for (const cb of this.onaborts) {
      cb();
    }
    return this;
  }
  async wait() {
    await this.pending;
    return this;
  }
};
var communicator_default = Communicator;
