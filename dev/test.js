"use strict";

import {Communicator} from "/src/communicator.js";

//tests
(async function() {
    /*
    Limits of the communication:
    - 31 bit messages (0-2147483647) per packet timeout (defult 3 seconds) per side
    - 16 bit (0-65535) max packet count
    */

    const equal = function(buf1, buf2) {
        if (typeof buf1 !== typeof buf2) {
            //console.log("a");
            return false;
        }
        if (!(buf1 instanceof ArrayBuffer)) {
            //console.log("b");
            return JSON.stringify(buf1) === JSON.stringify(buf2);
        }
        if (buf1.byteLength !== buf2.byteLength) {
            //console.log("c");
            return false;
        }
        const dv1 = new Uint8Array(buf1);
        const dv2 = new Uint8Array(buf2);
        for (let i = 0, length = buf1.byteLength; i < length; i++) {
            if (dv1[i] !== dv2[i]) {
                console.log(dv1[i], dv2[i]);
                return false;
            }
        }
        return true;
    };

    const randomArrayBuffer = function(size) {
        const buffer = new ArrayBuffer(size);
        const view = new DataView(buffer);
        for (let i = 0; i < size; i++) {
            view.setUint8(i, Math.floor(Math.random() * 256));
        }
        return buffer;
    };

    const randomArray = function(size) {
        const array = new Array(size);
        for (let i = 0; i < size; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }
        return array;
    };

    //test basic construct and sync
    console.log("Test 1...");
    const com1 = new Communicator({
        "sender": function(data, transfer) {
            //console.log(data)
            com2.receive(data);
        },
        "interactTimeout": 3000,

        "timeout": 5000,
        "packetSize": 100,
        "packetTimeout": 1000,
        "packetRetry": Infinity,
        "sendThreads": 16
    });

    const com2 = new Communicator({
        "sender": function(data, transfer) {
            //console.log(data)
            com1.receive(data);
        },
        "interactTimeout": 3000,

        "timeout": 5000,
        "packetSize": 100,
        "packetTimeout": 1000,
        "packetRetry": Infinity,
        "sendThreads": 16
    });

    await Promise.all([com1.TimeSync(), com2.TimeSync()]);
    await Promise.all([com1.SideSync(), com2.SideSync()]);
    
    if (com1.myReminder === com2.myReminder) {
        throw new Error("UID collision");
    }
    console.log("Test 1... OK");



    //test send, ArrayBuffer, without split, onincoming callback
    console.log("Test 2...");
    await new Promise(async (resolve, reject) => {
        const realData = randomArrayBuffer(2);
        const realDataCopy = realData.slice(0);
        com1.onsend = function(data) {
            //ignore
        };
        com1.onincoming = async function(message) {
            await message.wait();
            if (equal(message.data, realDataCopy)) {
                resolve("ok");
            } else {
                reject(new Error("Unexpected"));
            }
        };
        com1.oninvoke = function(message) {
            console.log("Inkvoke 1");
            reject(new Error("Unexpected"));
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.send(realData, [realData]);
    });
    console.log("Test 2... OK");

    //return;

    //test send, ArrayBuffer, without split, onsend callback
    console.log("Test 3...");
    await new Promise(async (resolve, reject) => {
        const realData = randomArrayBuffer(2);
        const realDataCopy = realData.slice(0);
        com1.onsend = function(data) {
            if (equal(data, realDataCopy)) {
                resolve("ok");
            } else {
                reject(new Error("Unexpected"));
            }
        };
        com1.onincoming = async function(message) {
            //ignore
        };
        com1.oninvoke = function(message) {
            console.log("Inkvoke 1");
            reject(new Error("Unexpected"));
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.send(realData, [realData]);
    });
    console.log("Test 3... OK");



    //test send, ArrayBuffer, without split, wait
    console.log("Test 4...");
    await new Promise(async (resolve, reject) => {
        const realData = randomArrayBuffer(2);
        const realDataCopy = realData.slice(0);
        com1.onsend = function(data) {
            //ignore
        };
        com1.onincoming = async function(message) {
            //ignore
        };
        com1.oninvoke = function(message) {
            console.log("Inkvoke 1");
            reject(new Error("Unexpected"));
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.send(realData, [realData]);
        await message.wait();
        resolve("ok");
    });
    console.log("Test 4... OK");


   
    //test send, Object, without split, onincoming callback
    console.log("Test 5...");
    await new Promise(async (resolve, reject) => {
        const realData = {"test": randomArray(5)};
        com1.onsend = function(data) {
            //ignore
        };
        com1.onincoming = async function(message) {
            await message.wait();
            //console.log(message.data, realData)
            if (equal(message.data, realData)) {
                resolve("ok");
            } else {
                reject(new Error("Unexpected"));
            }
        };
        com1.oninvoke = function(message) {
            console.log("Inkvoke 1");
            reject(new Error("Unexpected"));
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.send(realData, [realData]);
    });
    console.log("Test 5... OK");

    

    //test send, Object, without split, onsend callback
    console.log("Test 6...");
    await new Promise(async (resolve, reject) => {
        const realData = {"test": randomArray(5)};
        com1.onsend = function(data) {
            //console.log(data, realData)
            if (equal(data, realData)) {
                resolve("ok");
            } else {
                reject(new Error("Unexpected"));
            }
        };
        com1.onincoming = async function(message) {
            //ignore
        };
        com1.oninvoke = function(message) {
            console.log("Inkvoke 1");
            reject(new Error("Unexpected"));
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.send(realData, [realData]);
    });
    console.log("Test 6... OK");

    

    //test send, ArrayBuffer, split, onincoming callback
    console.log("Test 7...");
    await new Promise(async (resolve, reject) => {
        const realData = randomArrayBuffer(25000);
        const realDataCopy = realData.slice(0);
        com1.onsend = function(data) {
            //ignore
        };
        com1.onincoming = async function(message) {
            await message.wait();
            if (equal(message.data, realDataCopy)) {
                resolve("ok");
            } else {
                reject(new Error("Unexpected"));
            }
        };
        com1.oninvoke = function(message) {
            console.log("Inkvoke 1");
            reject(new Error("Unexpected"));
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.send(realData, [realData]);
    });
    console.log("Test 7... OK");


    //test send, ArrayBuffer, split, onsend callback
    console.log("Test 8...");
    await new Promise(async (resolve, reject) => {
        const realData = randomArrayBuffer(25000);
        const realDataCopy = realData.slice(0);
        com1.onsend = function(data) {
            if (equal(data, realDataCopy)) {
                resolve("ok");
            } else {
                reject(new Error("Unexpected"));
            }
        };
        com1.onincoming = async function(message) {
            // ignore
        };
        com1.oninvoke = function(message) {
            console.log("Inkvoke 1");
            reject(new Error("Unexpected"));
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.send(realData, [realData]);
    });
    console.log("Test 8... OK");



    //test invoke, ArrayBuffer, without split, onincoming callback
    console.log("Test 9...");
    await new Promise(async (resolve, reject) => {
        const realData = randomArrayBuffer(25);
        const realData2 = randomArrayBuffer(25);
        const realDataCopy = realData.slice(0);
        const realDataCopy2 = realData2.slice(0);
        com1.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com1.onincoming = async function(message) {
            
            await message.wait();
            if (equal(message.data, realDataCopy)) {
                message.send(realData2);
                console.log("aaaaaaaaa")
            } else {
                reject(new Error("Unexpected"));
            }
        };
        com1.oninvoke = function(message) {
            //ignore
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.invoke(realData, [realData]);
        await message.wait();
        if (equal(message.data, realDataCopy2)) {
            resolve("ok")
        } else {
            reject(new Error("Unexpected"));
        }
    });
    console.log("Test 9... OK");



    //test invoke, ArrayBuffer, without split, oninvoke callback
    console.log("Test 10...");
    await new Promise(async (resolve, reject) => {
        const realData = randomArrayBuffer(25);
        const realData2 = randomArrayBuffer(25);
        const realDataCopy = realData.slice(0);
        const realDataCopy2 = realData2.slice(0);
        com1.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com1.onincoming = async function(message) {
            //ignore
        };
        com1.oninvoke = function(message) {
            if (equal(message.data, realDataCopy)) {
                message.send(realData2);
            } else {
                reject(new Error("Unexpected"));
            }
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.invoke(realData, [realData]);
        await message.wait();
        if (equal(message.data, realDataCopy2)) {
            resolve("ok")
        } else {
            reject(new Error("Unexpected"));
        }
    });
    console.log("Test 10... OK");



    //test invoke, Object, without split, onincoming callback
    console.log("Test 11...");
    await new Promise(async (resolve, reject) => {
        const realData = {"test": randomArray(5)};
        const realData2 = {"test2": randomArray(5)};
        com1.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com1.onincoming = async function(message) {
            await message.wait();
            if (equal(message.data, realData)) {
                message.send(realData2);
            } else {
                reject(new Error("Unexpected"));
            }
        };
        com1.oninvoke = function(message) {
            //ignore
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.invoke(realData, [realData]);
        await message.wait();
        if (equal(message.data, realData2)) {
            resolve("ok")
        } else {
            reject(new Error("Unexpected"));
        }
    });
    console.log("Test 11... OK");
    


    //test invoke, Object, without split, oninvoke callback
    console.log("Test 12...");
    await new Promise(async (resolve, reject) => {
        const realData = {"test": randomArray(5)};
        const realData2 = {"test2": randomArray(5)};
        com1.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com1.onincoming = async function(message) {
            //ignore
        };
        com1.oninvoke = function(message) {
            if (equal(message.data, realData)) {
                message.send(realData2);
            } else {
                reject(new Error("Unexpected"));
            }
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.invoke(realData, [realData]);
        await message.wait();
        if (equal(message.data, realData2)) {
            resolve("ok")
        } else {
            reject(new Error("Unexpected"));
        }
    });
    console.log("Test 12... OK");
    

    //test invoke, ArrayBuffer, split, oninvoke callback
    console.log("Test 13...");
    await new Promise(async (resolve, reject) => {
        const realData = randomArrayBuffer(25000);
        const realData2 = randomArrayBuffer(25000);
        const realDataCopy = realData.slice(0);
        const realDataCopy2 = realData2.slice(0);
        com1.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com1.onincoming = async function(message) {
            await message.wait();
            if (equal(message.data, realDataCopy)) {
                message.send(realData2);
            } else {
                reject(new Error("Unexpected"));
            }
            
        };
        com1.oninvoke = function(message) {
            //ignore
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.invoke(realData, [realData]);
        await message.wait();
        if (equal(message.data, realDataCopy2)) {
            resolve("ok")
        } else {
            reject(new Error("Unexpected"));
        }
    });
    console.log("Test 13... OK");


    //test invoke, ArrayBuffer, split, oninvoke callback
    console.log("Test 14...");
    await new Promise(async (resolve, reject) => {
        const realData = randomArrayBuffer(25000);
        const realData2 = randomArrayBuffer(25000);
        const realDataCopy = realData.slice(0);
        const realDataCopy2 = realData2.slice(0);
        com1.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com1.onincoming = async function(message) {
            //ignore
        };
        com1.oninvoke = function(message) {
            if (equal(message.data, realDataCopy)) {
                message.send(realData2);
            } else {
                reject(new Error("Unexpected"));
            }
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.invoke(realData, [realData]);
        await message.wait();
        if (equal(message.data, realDataCopy2)) {
            resolve("ok")
        } else {
            reject(new Error("Unexpected"));
        }
    });
    console.log("Test 14... OK");


    //test invoke-invoke-send, ArrayBuffer, without split, onincoming callback
    console.log("Test 15...");
    await new Promise(async (resolve, reject) => {
        const realData = randomArrayBuffer(25);
        const realData2 = randomArrayBuffer(25);
        const realData3 = randomArrayBuffer(25);
        const realData4 = randomArrayBuffer(25);
        const realDataCopy = realData.slice(0);
        const realDataCopy2 = realData2.slice(0);
        const realDataCopy3 = realData3.slice(0);
        const realDataCopy4 = realData4.slice(0);
        console.log(new Uint8Array(realDataCopy));
        console.log(new Uint8Array(realDataCopy2));
        console.log(new Uint8Array(realDataCopy3));
        console.log(new Uint8Array(realDataCopy4));
        com1.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com1.onincoming = async function(message) {
            await message.wait();
            if (equal(message.data, realDataCopy)) {
                message.invoke(realData2);
            } else {
                reject(new Error("Unexpected"));
            }
            message.onincoming = async function(message) {
                await message.wait();
                
                if (equal(message.data, realDataCopy3)) {
                    message.send(realData4);
                } else {
                    reject(new Error("Unexpected"));
                }
            };
        };
        com1.oninvoke = function(message) {
            //ignore
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.invoke(realData, [realData]);
        await message.wait();
        if (equal(message.data, realDataCopy2)) {

        } else {
            reject(new Error("Unexpected"));
        }

        message.invoke(realData3);
        await message.wait();
        if (equal(message.data, realDataCopy4)) {
            resolve("ok");
        } else {
            reject(new Error("Unexpected"));
        }
    });
    console.log("Test 15... OK");


    //test invoke-invoke-send, ArrayBuffer, split, onincoming callback
    console.log("Test 16...");
    await new Promise(async (resolve, reject) => {
        const realData = randomArrayBuffer(25000);
        const realData2 = randomArrayBuffer(25000);
        const realData3 = randomArrayBuffer(25000);
        const realData4 = randomArrayBuffer(25000);
        const realDataCopy = realData.slice(0);
        const realDataCopy2 = realData2.slice(0);
        const realDataCopy3 = realData3.slice(0);
        const realDataCopy4 = realData4.slice(0);
        console.log(new Uint8Array(realDataCopy));
        console.log(new Uint8Array(realDataCopy2));
        console.log(new Uint8Array(realDataCopy3));
        console.log(new Uint8Array(realDataCopy4));
        com1.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com1.onincoming = async function(message) {
            await message.wait();
            console.log("aaaaa", new Uint8Array(message.data));
            if (equal(message.data, realDataCopy)) {
                message.invoke(realData2);
            } else {
                reject(new Error("Unexpected"));
            }
            message.onincoming = async function(message) {
                
                await message.wait();
                console.log("bbbbbb", new Uint8Array(message.data));
                if (equal(message.data, realDataCopy3)) {
                    message.send(realData4);
                } else {
                    reject(new Error("Unexpected"));
                }
            };
        };
        com1.oninvoke = function(message) {
            //ignore
        };

        com2.onsend = function(data) {
            reject(new Error("Unexpected"));
        };
        com2.onincoming = async function(message) {
            reject(new Error("Unexpected"));
        };
        com2.oninvoke = async function(message) {
            reject(new Error("Unexpected"));
        };

        let message = com2.invoke(realData, [realData]);
        await message.wait();
        if (equal(message.data, realDataCopy2)) {

        } else {
            reject(new Error("Unexpected"));
        }
        message.invoke(realData3);
        await message.wait();
        console.log(new Uint8Array(message.data));
        if (equal(message.data, realDataCopy4)) {
            resolve("ok");
        } else {
            reject(new Error("Unexpected"));
        }
    });
    console.log("Test 16... OK");



    return;
    com2.onincoming = async function(message) {
        message.onprogress = function(message) {
            message.progress;
        };
        message.onload = function(message) {

        };
        //message.abort();
        const [error, data, isInvoke] = await message.wait();
        message.error;
        message.data;
        message.isInvoke;


        message.send(new ArrayBuffer(8));

    };
    com2.onsend = function(data) {
        console.log("Send 2");
        
    };
    com2.oninvoke = async function(message) {
        message.data;
        message.error;


        message.invoke(new ArrayBuffer(8));
        message.onprogress = function(progress) {

        };
        message.onload = function(error, data, reply) {

        };
        //message.abort();
        await message.wait();
        message.data;
        message.error;
    };
    


    let message = com2.send(new ArrayBuffer(2), []);
    message.onprogress = function(progress) {

    };
    message.onload = function(error, data, reply) {
        
    };
    //message.abort();
    await message.wait();
    console.log(message.error);
    message.data;
})();