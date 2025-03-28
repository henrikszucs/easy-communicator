// open the communication channel

const communicator = new Communicator({
    "sender": function(data, transfer) {
        //console.log(data)
        myWorker.port.postMessage({"message": data}, transfer);
    },
    "interactTimeout": 3000,

    "timeout": 5000,
    "packetSize": 100,
    "packetTimeout": 1000,
    "packetRetry": Infinity,
    "sendThreads": 16
});

const myWorker = new Worker("test_worker.js", {type: "module"});
myWorker.onmessage = function (event) {
    if (typeof event.data["log"] !== "undefined") {
        console.log("Worker:", event.data["log"]);
    } else if (typeof event.data["message"] !== "undefined") {
        communicator.receive(event.data["message"]);
    }
};