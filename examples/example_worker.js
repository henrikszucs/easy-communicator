"use strict";

import {Communicator} from "/src/communicator.js";

const communicator = new Communicator({
    "sender": function(data, transfer) {
        //console.log(data)
        postMessage({"message": data}, transfer);
    },
    "interactTimeout": 3000,

    "timeout": 5000,
    "packetSize": 100,
    "packetTimeout": 1000,
    "packetRetry": Infinity,
    "sendThreads": 16
});

onmessage = function(event) {
    if (typeof event.data["message"] !== "undefined") {
        communicator.receive(event.data["message"]);
    }
};