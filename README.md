# easy-communicator

JavaScript library to handle one or two way communication in any type of channels. 

## Install

Copy and import the following file:

[./src/communicator.js](./src/communicator.js)

## Usage

### create Communicator
```js
//setup comminicator
const com = new Communicator({
    "sender": async function(data, transfer, message) {
        //the function that will convert and send the to the other side e.g. postMessage, WebRTC, XMLHttpRequest etc.
        window.postMessage(data, transfer);
        // should not throw error
        // message - message object to e.g. abort if sender function run to critical error
        // if sender function throws error it will triggers com.ERROR.TRANSFER_SEND error in message object
    },
    "interactTimeout": 3000,    //the max timeout between two packet arrive

    "timeout": 5000,            //the time for transmit message
    "packetSize": 1000,         //the maximum size of one packet in bytes (only for ArrayBuffer)
    "packetTimeout": 1000,      //the max timeout for packets
    "packetRetry": Infinity,    //number of retring attemts for one packet
    "sendThreads": 16           //maximum number of the parallel sended pakcets

    "timeOffset"                //the time difference between the sender and reciever (sender-reciever), only if you want implement time sync on your own
});

//listen incoming message
window.addEventListener("message", function(msg) {
    //convert and pass the message to the Communicator what the other Communicator sent from the other side
    com.recieve(msg);
});

//sync some metadata between communicators
await com.sideSync();   //mandatory to sync side to know the source of packets and messages
await com.timeSync();   //sync time delay (need for network communication, in IPC no required to sync that)

//Communicator ready to use :)
```

### recieve data
```js
com.onSend(function(data) {
    console.log(data);
});
com.onInvoke(async function(messageObj) {
    //messageObj - message object that finished the recieving phase
    console.log(messageObj.data);
});
com.onIncoming(async function(messageObj) {
    //messageObj - message object that NOT finished the recieving phase
    messageObj.onProgress(function(progress) { //listen progress

    });
    await messageObj.wait();    //wait the pending recieveing

    //can read finished data
    messageObj.progress;
    messageObj.isInvoke;
    messageObj.error;
    messageObj.data;
});
```

### Send data
```js
//customise sending
const buf = new ArrayBuffer(16);
const data = {
    "customBuf": buf
};
const timeout = 5000;
let messageObj = com.send(
    data,
    [buf],
    timeout,    //optional, just if want to monify the setted values for this ending
    {
        "packetSize": 500,      //optional, just if want to monify the setted values for this ending
        "packetTimeout": 2000,  //optional, just if want to monify the setted values for this ending
        "packetRetry": 10,      //optional, just if want to monify the setted values for this ending
        "sendThreads": 8        //optional, just if want to monify the setted values for this ending
    }
);

//check the progress
messageObj.onProgress(function (progress) {
    console.log(progress);
});

//wait to finish
await messageObj.wait();

//check error
messageObj.error;
```

### Invoke data
```js
//customise sending
const buf = new ArrayBuffer(16);
const data = {
    "customBuf": buf
};
const timeout = 5000;
let messageObj = com.invoke(
    data,
    [buf],
    timeout,    //optional, just if want to monify the setted values for this ending
    {
        "packetSize": 500,      //optional, just if want to monify the setted values for this ending
        "packetTimeout": 2000,  //optional, just if want to monify the setted values for this ending
        "packetRetry": 10,      //optional, just if want to monify the setted values for this ending
        "sendThreads": 8        //optional, just if want to monify the setted values for this ending
    }
);

//check the progress
messageObj.onProgress(function (progress) {
    console.log(progress);
});

//wait to finish
await messageObj.wait();

//answer will be in messageObj
messageObj.progress;
messageObj.isInvoke;
messageObj.error;
messageObj.data;
```

### errors
```js
//if no error will be an empty string ("") else one of error string
com.ERROR.TIMEOUT;
com.ERROR.INACTIVE;
com.ERROR.ABORT;
com.ERROR.REJECT;
com.ERROR.TRANSFER_SEND;
com.ERROR.TRANSFER_RECEIVE;
```