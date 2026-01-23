"use strict";

import Communicator from "/src/communicator.js";

//tests
(async function() {
    await new Promise(function(resolve) {
        setTimeout(() => {
            resolve();
        }, 100);
    });

    // setup data generators and validators
    const RandomArrayBuffer = function(size) {
        const buffer = new ArrayBuffer(size);
        const view = new DataView(buffer);
        for (let i = 0; i < size; i++) {
            view.setUint8(i, Math.floor(Math.random() * 256));
        }
        return buffer;
    };

    const RandomArray = function(size) {
        const array = new Array(size);
        for (let i = 0; i < size; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }
        return array;
    };

    const Copy = function(data) {
        if (data instanceof ArrayBuffer) {
            return data.slice(0);
        }
        return JSON.parse(JSON.stringify(data));
    };

    const Modify = function(data) {
        if (data instanceof ArrayBuffer) {
            const view = new DataView(data);
            const data2 = new ArrayBuffer(data.byteLength);
            const view2 = new DataView(data2);
            for (let i = 0, length = data2.byteLength; i < length; i++) {
                view2.setUint8(i, (view.getUint8(i) + 1) % 256);
            }
            return data2;
        } else {
            const data2 = JSON.stringify(data).split("");
            for (let i = 0, length = data2.length; i < length; i++) {
                if ("0123456789".indexOf(data2[i]) !== -1) {
                    data2[i] = Math.max((parseInt(data2[i]) + 1) % 10, 1);
                }
            }
            return JSON.parse(data2.join(""));
        }
    };

    const Equal = function(data, data2) {
        if (typeof data !== typeof data2) {
            //console.log("a");
            return false;
        }
        if (!(data instanceof ArrayBuffer)) {
            //console.log("b");
            return JSON.stringify(data) === JSON.stringify(data2);
        }
        if (data.byteLength !== data2.byteLength) {
            //console.log("c");
            return false;
        }
        const dv1 = new Uint8Array(data);
        const dv2 = new Uint8Array(data2);
        for (let i = 0, length = data.byteLength; i < length; i++) {
            if (dv1[i] !== dv2[i]) {
                console.log(dv1[i], dv2[i]);
                return false;
            }
        }
        return true;
    };
    
    const packetSize = 1000;

    //test basic construct and sync
    console.log("Test 1...");
    const com1 = new Communicator({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
            }
            console.log(new Uint8Array(data));
            await new Promise(function(resolve) {
                setTimeout(() => {
                    resolve();
                }, 1);
            });
            com2.receive(data);
        },
        "interactTimeout": 3000,

        "timeout": 5000,
        "packetSize": packetSize,
        "packetTimeout": 1000,
        "packetRetry": Infinity,
        "sendThreads": 16
    });

    const com2 = new Communicator({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
            }
            console.log(data)
            await new Promise(function(resolve) {
                setTimeout(() => {
                    resolve();
                }, 1);
            });
            com1.receive(data);
        },
        "interactTimeout": 3000,

        "timeout": 5000,
        "packetSize": packetSize,
        "packetTimeout": 1000,
        "packetRetry": Infinity,
        "sendThreads": 16
    });

    await Promise.all([com1.timeSync(), com1.sideSync(), com2.timeSync(), com2.sideSync()]);
    
    if (com1.myReminder === com2.myReminder) {
        throw new Error("UID collision");
    }
    console.log("Test 1... OK");



    //test send procedure
    const sendProcedure = async function (data) {
        return new Promise(async (resolve, reject) => {
            //store reference values
            const realData = data;
            const realDataCopy = Copy(realData);

            //count attempts
            let goodAttempts = 0;
            const good = function () {
                goodAttempts++;
                if (goodAttempts === 3) {
                    resolve("ok");
                }
            };
            
            //setup callbacks
            com1.onSend(function(data) {
                if (Equal(data, realDataCopy) === false) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();
            });
            com1.onIncoming(async function(message) {
                await message.wait();
                if (Equal(message.data, realDataCopy) === false) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();
            });
            com1.onInvoke(function(message) {
                reject(new Error("Unexpected"));
            });
    
            com2.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com2.onIncoming(async function(message) {
                reject(new Error("Unexpected"));
            });
            com2.onInvoke(async function(message) {
                reject(new Error("Unexpected"));
            });
    
            let message = com2.send(realData, [realData]);
            await message.wait();
            good();
        });
    };


    // test send, ArrayBuffer
    console.log("Test 2...");
    await sendProcedure(RandomArrayBuffer(100));
    console.log("Test 2... OK");

    // test send, Object
    console.log("Test 3...");
    await sendProcedure({"test": RandomArray(100)});
    console.log("Test 3... OK");

    // test send, ArrayBuffer, large
    console.log("Test 4...");
    await sendProcedure(RandomArrayBuffer(100000));
    console.log("Test 4... OK");
    

    // test invoke procedure
    const invokeProcedure = async function (data) {
        return new Promise(async (resolve, reject) => {
            //store reference values
            const realData = data;
            const realDataCopy = Copy(realData);
            const realModify = Modify(realData);
            const realModifyCopy = Modify(realData);

            //count attempts
            let goodAttempts = 0;
            const good = function () {
                goodAttempts++;
                if (goodAttempts === 3) {
                    resolve("ok");
                }
            };

            com1.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com1.onIncoming(async function(message) {
                await message.wait();
                if (Equal(message.data, realDataCopy) === false) {
                    reject(new Error("Unexpected"));
                    return;
                }
                message.send(realModify);
                await message.wait();
                good();
            });
            com1.onInvoke(function(message) {
                if (Equal(message.data, realDataCopy) === false) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();
            });
    
            com2.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com2.onIncoming(async function(message) {
                reject(new Error("Unexpected"));
            });
            com2.onInvoke(async function(message) {
                reject(new Error("Unexpected"));
            });
    
            let message = com2.invoke(realData, [realData]);
            await message.wait();
            if (Equal(message.data, realModifyCopy) === false) {
                reject(new Error("Unexpected"));
                return;
            }
            good();
        });
    };

    
    // test invoke, ArrayBuffer
    console.log("Test 5...");
    await invokeProcedure(RandomArrayBuffer(100));
    console.log("Test 5... OK");

    // test invoke, Object
    console.log("Test 6...");
    await invokeProcedure({"test": RandomArray(100)});
    console.log("Test 6... OK");
    
    // test invoke, ArrayBuffer, large
    console.log("Test 7...");
    await invokeProcedure(RandomArrayBuffer(100000));
    console.log("Test 7... OK");

    
    // test invoke-invoke-send procedure
    const invokeInvokeProcedure = async function (data) {
        return new Promise(async (resolve, reject) => {
            //store reference values
            const realData = data;
            const realDataCopy = Copy(realData);
            const realModify = Modify(realData);
            const realModifyCopy = Modify(realData);
            const realModifyModify = Modify(realModify);
            const realModifyModifyCopy = Modify(realModify);

            //count attempts
            let goodAttempts = 0;
            const good = function () {
                goodAttempts++;
                if (goodAttempts === 7) {
                    resolve("ok");
                }
            };

            com1.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com1.onIncoming(async function(message) {
                await message.wait();
                if (Equal(message.data, realDataCopy) === false) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();
                message.invoke(realModify);
                good();
                message.onIncoming(async function(message) {
                    good();
                    await message.wait();
                    if (Equal(message.data, realModifyModifyCopy) == false) {
                        reject(new Error("Unexpected"));
                        return;
                    }
                    good();
                });
            });
            com1.onInvoke(function(message) {
                if (Equal(message.data, realDataCopy) === false) {
                    reject(new Error("Unexpected"));
                    return;
                    
                }
                good();
            });
    
            com2.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com2.onIncoming(async function(message) {
                reject(new Error("Unexpected"));
            });
            com2.onInvoke(async function(message) {
                reject(new Error("Unexpected"));
            });
    
            let message = com2.invoke(realData, [realData]);
            await message.wait();
            if (Equal(message.data, realModifyCopy) === false) {
                reject(new Error("Unexpected"));
                return;
            }
            good();

            message.send(realModifyModify);
            await message.wait();
            good();
        });
    };

    // test invoke-invoke, ArrayBuffer
    console.log("Test 8...");
    await invokeInvokeProcedure(RandomArrayBuffer(100));
    console.log("Test 8... OK");

    // test invoke-invoke, Object
    console.log("Test 9...");
    await invokeInvokeProcedure({"test": RandomArray(100)});
    console.log("Test 9... OK");

    // test invoke-invoke, ArrayBuffer, large
    console.log("Test 10...");
    await invokeInvokeProcedure(RandomArrayBuffer(100000));
    console.log("Test 10... OK");

   

    //test invoke-invoke-invoke-send procedure
    const invokeInvokeInvokeProcedure = async function (data) {
        return new Promise(async (resolve, reject) => {
            //store reference values
            const realData = data;
            const realDataCopy = Copy(realData);
            const realModify = Modify(realData);
            const realModifyCopy = Modify(realData);
            const realModifyModify = Modify(realModify);
            const realModifyModifyCopy = Modify(realModify);
            const realModifyModifyModify = Modify(realModifyModify);
            const realModifyModifyModifyCopy = Modify(realModifyModify);

            //count attempts
            let goodAttempts = 0;
            const good = function () {
                goodAttempts++;
                if (goodAttempts === 6) {
                    resolve("ok");
                }
            };

            com1.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com1.onIncoming(async function(message) {
                await message.wait();
                if (Equal(message.data, realDataCopy) === false) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();
                
            });
            com1.onInvoke(async function(message) {
                if (Equal(message.data, realDataCopy) === false) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();
                await message.invoke(realModify).wait();
                if (Equal(message.data, realModifyModifyCopy) === false) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();
                const c = message.send(realModifyModifyModify).wait();
                await c;
                good();
            });

            com2.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com2.onIncoming(async function(message) {
                reject(new Error("Unexpected"));
            });
            com2.onInvoke(async function(message) {
                reject(new Error("Unexpected"));
            });

            let message = await com2.invoke(realData, [realData]).wait();
            if (Equal(message.data, realModifyCopy) === false) {
                reject(new Error("Unexpected"));
                return;
            }
            good();
            
            await message.invoke(realModifyModify).wait();
            if (Equal(message.data, realModifyModifyModifyCopy) === false) {
                reject(new Error("Unexpected"));
                return;
            }
            good();
        });
    };


    // test invoke-invoke-invoke, ArrayBuffer
    console.log("Test 11...");
    await invokeInvokeInvokeProcedure(RandomArrayBuffer(100));
    console.log("Test 11... OK");

    // test invoke-invoke-invoke, Object
    console.log("Test 12...");
    await invokeInvokeInvokeProcedure({"test": RandomArray(100)});
    console.log("Test 12... OK");

    // test invoke-invoke-invoke, ArrayBuffer, large
    console.log("Test 13...");
    await invokeInvokeInvokeProcedure(RandomArrayBuffer(100000));
    console.log("Test 13... OK");



    //add latency for testing progress
    com1.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
            }
            await new Promise(function(resolve) {
                setTimeout(() => {
                    resolve();
                }, 1);
            });
            com2.receive(data);
        }
    });
    com2.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
            }
            await new Promise(function(resolve) {
                setTimeout(() => {
                    resolve();
                }, 1);
            });
            com1.receive(data);
        }
    });

    //test send progress states
    const progressSendProcedure = async function (data) {
        return new Promise(async (resolve, reject) => {
            let numOfProgress = 1;
            if (data instanceof ArrayBuffer) {
                numOfProgress = Math.ceil(data.byteLength / packetSize);
            }
            const realData = data;
            const realDataCopy = Copy(realData);
            let progressTest = 1 / numOfProgress;
            let progressTestRecv = 1 / numOfProgress;

            //count attempts
            let goodAttempts = 0;
            const good = function () {
                goodAttempts++;
                if (goodAttempts === 3 + numOfProgress * 2) {
                    resolve("ok");
                }
            };

            com1.onSend(function(data) {
                if (Equal(data, realDataCopy) === false) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();

            });
            com1.onIncoming(async function(message) {
                message.onProgress(function(progress) {
                    if (progress !== progressTestRecv) {
                        reject(new Error("Unexpected"));
                        return;
                    }
                    
                    progressTestRecv += 1 / (numOfProgress);
                    good();
                });
                await message.wait();
                good();
                
            });
            com1.onInvoke(async function(message) {
                reject(new Error("Unexpected"));
            });

            com2.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com2.onIncoming(async function(message) {
                reject(new Error("Unexpected"));
            });
            com2.onInvoke(async function(message) {
                reject(new Error("Unexpected"));
            });

            let message = com2.send(realData, [realData]);
            message.onProgress(function(progress) {
                if (progress !== progressTest) {
                    console.log(progress);
                    console.log(progressTest);
                    reject(new Error("Unexpected"));
                    return;
                }
                
                progressTest += 1 / (numOfProgress);
                good();
            });
            await message.wait();
            if (message.progress !== 1) {
                reject(new Error("Unexpected"));
                return;
            }
            if (message.error !== "") {
                reject(new Error("Unexpected"));
                return;
            }
            good();
        });
    };
    

    // test send progress, ArrayBuffer
    console.log("Test 14...");
    await progressSendProcedure(RandomArrayBuffer(100));
    console.log("Test 14... OK");
    
    // test send progress, Object
    console.log("Test 15...");
    await progressSendProcedure({"test": RandomArray(100)});
    console.log("Test 15... OK");

    // test send progress, ArrayBuffer, large
    console.log("Test 16...");
    await progressSendProcedure(RandomArrayBuffer(3100));
    console.log("Test 16... OK");
   


    
    //test invoke progress states
    const progressInvokeProcedure = async function (data) {
        return new Promise(async (resolve, reject) => {
            let numOfProgress = 1 * 2;
            if (data instanceof ArrayBuffer) {
                numOfProgress = Math.ceil(data.byteLength / packetSize) * 2;
            }
            const realData = data;
            const realDataCopy = Copy(realData);
            const realModify = Modify(realData);
            const realModifyCopy = Modify(realData);
            let progressTest = 1 / numOfProgress;

            //count attempts
            let goodAttempts = 0;
            const good = function () {
                goodAttempts++;
                if (goodAttempts === 4 + numOfProgress) {
                    resolve("ok");
                }
            };

            com1.onSend(function(data) {
                reject(new Error("Unexpected"));

            });
            com1.onIncoming(async function(message) {
                await message.wait();
                if (Equal(message.data, realDataCopy) === false) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();

                await message.send(realModify).wait();
                good();
                
            });
            com1.onInvoke(async function(message) {
                good();
            });

            com2.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com2.onIncoming(async function(message) {
                reject(new Error("Unexpected"));
            });
            com2.onInvoke(async function(message) {
                reject(new Error("Unexpected"));
            });

            let message = com2.invoke(realData, [realData]);
            message.onProgress(function(progress) {

                if (progress !== progressTest) {
                    console.log(progress);
                    console.log(progressTest);
                    reject(new Error("Unexpected"));
                    return;
                }
                
                progressTest += 1 / numOfProgress;
                good();
            });
            await message.wait();
            if (message.progress !== 1) {
                reject(new Error("Unexpected"));
                return;
            }
            if (message.error !== "") {
                reject(new Error("Unexpected"));
                return;
            }
            if (Equal(message.data, realModifyCopy) === false) {
                reject(new Error("Unexpected"));
                return;
            }
            good();
        });
    };


    // test send progress, ArrayBuffer
    console.log("Test 17...");
    await progressInvokeProcedure(RandomArrayBuffer(100));
    console.log("Test 17... OK");
    
    // test send progress, Object
    console.log("Test 18...");
    await progressInvokeProcedure({"test": RandomArray(100)});
    console.log("Test 18... OK");

    // test send progress, ArrayBuffer, large
    console.log("Test 19...");
    await progressInvokeProcedure(RandomArrayBuffer(3100));
    console.log("Test 19... OK");
    
    

    //modifiy channel 50% drop rate
    let dropped = [];
    com1.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
                console.log(data);
            }
            
            if (Math.random() < 0.5) {
                dropped.push({"com1": 1, "l": data.byteLength});
                return;
            }
            dropped.push({"com1": 0, "l": data.byteLength});
            com2.receive(data);
        },
        "timeout": 5000,
        "packetSize": 100,
        "packetTimeout": 100,
        "packetRetry": Infinity,
        "sendThreads": 16
    });
    com2.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
                console.log(data);
            }
            if (Math.random() < 0.5) {
                dropped.push({"com2": 1, "l": data.byteLength});
                return;
            }
            dropped.push({"com2": 0, "l": data.byteLength});
            com1.receive(data);
        },
        "timeout": 5000,
        "packetSize": 100,
        "packetTimeout": 100,
        "packetRetry": Infinity,
        "sendThreads": 16
    });

    // test invoke procedure
    const invokeDropoutProcedure = async function (data) {
        return new Promise(async (resolve, reject) => {
            dropped = [];
            //store reference values
            const realData = data;
            const realDataCopy = Copy(realData);
            const realModify = Modify(realData);
            const realModifyCopy = Modify(realData);

            //count attempts
            let goodAttempts = 0;
            const good = function () {
                goodAttempts++;
                if (goodAttempts === 3) {
                    resolve("ok");
                }
            };

            com1.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com1.onIncoming(async function(message) {
                await message.wait();
                if (Equal(message.data, realDataCopy) === false) {
                    reject(new Error("Unexpected"));
                    return;
                }
                message.send(realModify);
                await message.wait();
                good();
            });
            com1.onInvoke(function(message) {
                if (Equal(message.data, realDataCopy) === false) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();
            });

            com2.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com2.onIncoming(async function(message) {
                reject(new Error("Unexpected"));
            });
            com2.onInvoke(async function(message) {
                reject(new Error("Unexpected"));
            });

            let message = com2.invoke(realData, [realData]);
            await message.wait();
            
            if (Equal(message.data, realModifyCopy) === false) {
                reject(new Error("Unexpected"));
                return;
            }
            good();
        });
    };
    
    try {
        console.log("Test 20...");
        await invokeDropoutProcedure(RandomArrayBuffer(50));
        console.log("Test 20... OK");
        
        // test send progress, Object
        console.log("Test 21...");
        await invokeDropoutProcedure({"test": RandomArray(100)});
        console.log("Test 21... OK");

        console.log("Test 22...");
        await invokeDropoutProcedure(RandomArrayBuffer(450));
        console.log("Test 22... OK");
    }
    catch (e) {
        console.log(dropped);
        console.error(e);
    }
    console.log(dropped);

    //wait console log
    await new Promise(function(resolve) {
        setTimeout(() => {
            resolve();
        }, 100);
    });

    let isNeedStop = false;
    //test timeout error
    isNeedStop = false;
    com1.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
                console.log(data);
            }
            if (isNeedStop) {
                dropped.push({"com1": 1, "l": data.byteLength});
                return;
            }
            dropped.push({"com1": 0, "l": data.byteLength});
            com2.receive(data);
        },
        "interactTimeout": 1000,
        "timeout": 500,
        "packetSize": 100,
        "packetTimeout": 100,
        "packetRetry": Infinity,
        "sendThreads": 16
    });
    com2.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
                console.log(data);
            }
            if (isNeedStop) {
                dropped.push({"com2": 1, "l": data.byteLength});
                return;
            }
            dropped.push({"com2": 0, "l": data.byteLength});
            com1.receive(data);
            isNeedStop = true;
        },
        "interactTimeout": 1000,
        "timeout": 500,
        "packetSize": 100,
        "packetTimeout": 100,
        "packetRetry": Infinity,
        "sendThreads": 16
    });
    const timeoutProcedure = async function (data) {
        return new Promise(async (resolve, reject) => {
            dropped = [];
            //store reference values
            const realData = data;
            const realDataCopy = Copy(realData);
            const realModify = Modify(realData);
            const realModifyCopy = Modify(realData);

            //count attempts
            let goodAttempts = 0;
            const good = function () {
                goodAttempts++;
                if (goodAttempts === 3) {
                    resolve("ok");
                }
            };

            com1.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com1.onIncoming(async function(message) {
                good();
                await message.wait();
                if (message.error !== com1.ERROR.INACTIVE) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();
            });
            com1.onInvoke(function(message) {
                reject(new Error("Unexpected"));
            });

            com2.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com2.onIncoming(async function(message) {
                reject(new Error("Unexpected"));
            });
            com2.onInvoke(async function(message) {
                reject(new Error("Unexpected"));
            });

            let message = com2.invoke(realData, [realData]);
            await message.wait();
            if (message.error !== com2.ERROR.TIMEOUT) {
                reject(new Error("Unexpected"));
                return;
            }
            good();
        });
    };
    console.log("Test 23...");
    await timeoutProcedure(RandomArrayBuffer(150));
    console.log("Test 23... OK");



    //test inactive error
    isNeedStop = false;
    com1.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
                console.log(data);
            }
            if (isNeedStop) {
                dropped.push({"com1": 1, "l": data.byteLength});
                return;
            }
            dropped.push({"com1": 0, "l": data.byteLength});
            com2.receive(data);
        },
        "interactTimeout": 500,

        "timeout": 1000,
        "packetSize": 100,
        "packetTimeout": 100,
        "packetRetry": Infinity,
        "sendThreads": 16
    });
    com2.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
                console.log(data);
            }
            if (isNeedStop) {
                dropped.push({"com2": 1, "l": data.byteLength});
                return;
            }
            dropped.push({"com2": 0, "l": data.byteLength});
            com1.receive(data);
            isNeedStop = true;
        },
        "interactTimeout": 500,

        "timeout": 1000,
        "packetSize": 100,
        "packetTimeout": 100,
        "packetRetry": Infinity,
        "sendThreads": 16
    });
    const inactiveProcedure = async function (data) {
        return new Promise(async (resolve, reject) => {
            dropped = [];
            //store reference values
            const realData = data;
            const realDataCopy = Copy(realData);
            const realModify = Modify(realData);
            const realModifyCopy = Modify(realData);

            //count attempts
            let goodAttempts = 0;
            const good = function () {
                goodAttempts++;
                if (goodAttempts === 3) {
                    resolve("ok");
                }
            };

            com1.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com1.onIncoming(async function(message) {
                good();
                await message.wait();
                if (message.error !== com1.ERROR.INACTIVE) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();
            });
            com1.onInvoke(function(message) {
                reject(new Error("Unexpected"));
            });

            com2.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com2.onIncoming(async function(message) {
                reject(new Error("Unexpected"));
            });
            com2.onInvoke(async function(message) {
                reject(new Error("Unexpected"));
            });

            let message = com2.invoke(realData, [realData]);
            await message.wait();
            if (message.error !== com2.ERROR.INACTIVE) {
                reject(new Error("Unexpected"));
                return;
            }
            good();
        });
    };
    console.log("Test 24...");
    await inactiveProcedure(RandomArrayBuffer(150));
    console.log("Test 24... OK");

    
    

    //test abort/reject error
    isNeedStop = false;
    com1.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
                console.log(data);
            }
            if (isNeedStop) {
                dropped.push({"com1": 1, "l": data.byteLength});
                return;
            }
            dropped.push({"com1": 0, "l": data.byteLength});
            await new Promise((resolve) => {
                setTimeout(resolve, 1);
            });
            com2.receive(data);
        },
        "interactTimeout": 500,

        "timeout": 1000,
        "packetSize": 100,
        "packetTimeout": 100,
        "packetRetry": Infinity,
        "sendThreads": 16
    });
    com2.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
                console.log(data);
            }
            if (isNeedStop) {
                dropped.push({"com2": 1, "l": data.byteLength});
                return;
            }
            dropped.push({"com2": 0, "l": data.byteLength});
            await new Promise((resolve) => {
                setTimeout(resolve, 1);
            });
            com1.receive(data);
        },
        "interactTimeout": 500,
        
        "timeout": 1000,
        "packetSize": 100,
        "packetTimeout": 100,
        "packetRetry": Infinity,
        "sendThreads": 16
    });
    const abortProcedure = async function (data) {
        return new Promise(async (resolve, reject) => {
            dropped = [];
            //store reference values
            const realData = data;
            const realDataCopy = Copy(realData);
            const realModify = Modify(realData);
            const realModifyCopy = Modify(realData);

            //count attempts
            let goodAttempts = 0;
            const good = function () {
                goodAttempts++;
                if (goodAttempts === 3) {
                    resolve("ok");
                }
            };

            com1.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com1.onIncoming(async function(message) {
                good();
                await message.wait();
                console.log(message.error);
                if (message.error !== com1.ERROR.REJECT) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();
            });
            com1.onInvoke(function(message) {
                reject(new Error("Unexpected"));
            });

            com2.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com2.onIncoming(async function(message) {
                reject(new Error("Unexpected"));
            });
            com2.onInvoke(async function(message) {
                reject(new Error("Unexpected"));
            });

            let message = com2.invoke(realData, [realData]);
            message.abort();
            await message.wait();
            console.log(message.error);
            if (message.error !== com2.ERROR.ABORT) {
                reject(new Error("Unexpected"));
                return;
            }
            good();
        });
    };
    console.log("Test 25...");
    await abortProcedure(RandomArrayBuffer(10050));
    console.log("Test 25... OK");


    const abortSendProcedure = async function (data) {
        return new Promise(async (resolve, reject) => {
            dropped = [];
            //store reference values
            const realData = data;
            const realDataCopy = Copy(realData);
            const realModify = Modify(realData);
            const realModifyCopy = Modify(realData);

            //count attempts
            let goodAttempts = 0;
            const good = function () {
                goodAttempts++;
                if (goodAttempts === 3) {
                    resolve("ok");
                }
            };

            com1.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com1.onIncoming(async function(message) {
                good();
                await message.wait();
                console.log(message.error);
                if (message.error !== com1.ERROR.REJECT) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();
            });
            com1.onInvoke(function(message) {
                reject(new Error("Unexpected"));
            });

            com2.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com2.onIncoming(async function(message) {
                reject(new Error("Unexpected"));
            });
            com2.onInvoke(async function(message) {
                reject(new Error("Unexpected"));
            });

            let message = com2.send(realData, [realData]);
            message.abort();
            await message.wait();
            if (message.error !== com2.ERROR.ABORT) {
                reject(new Error("Unexpected"));
                return;
            }
            good();
        });
    };

    console.log("Test 26...");
    await abortSendProcedure(RandomArrayBuffer(10050));
    console.log("Test 26... OK");


    //test recieve error
    isNeedStop = false;
    com1.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
                console.log(data);
            }
            if (isNeedStop) {
                dropped.push({"com1": 1, "l": data.byteLength});
                return;
            }
            dropped.push({"com1": 0, "l": data.byteLength});
            await new Promise((resolve) => {
                setTimeout(resolve, 1);
            });
            com2.receive(data);
        },
        "interactTimeout": 500,

        "timeout": 1000,
        "packetSize": 100,
        "packetTimeout": 100,
        "packetRetry": 2,
        "sendThreads": 16
    });
    com2.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
                console.log(data);
            }
            if (isNeedStop) {
                dropped.push({"com2": 1, "l": data.byteLength});
                return;
            }
            dropped.push({"com2": 0, "l": data.byteLength});
            await new Promise((resolve) => {
                setTimeout(resolve, 1);
            });
            com1.receive(data);
            isNeedStop = true;
        },
        "interactTimeout": 500,
        
        "timeout": 1000,
        "packetSize": 100,
        "packetTimeout": 100,
        "packetRetry": 2,
        "sendThreads": 16
    });
    const recieveProcedure = async function (data) {
        return new Promise(async (resolve, reject) => {
            dropped = [];
            //store reference values
            const realData = data;
            const realDataCopy = Copy(realData);
            const realModify = Modify(realData);
            const realModifyCopy = Modify(realData);

            //count attempts
            let goodAttempts = 0;
            const good = function () {
                goodAttempts++;
                if (goodAttempts === 3) {
                    resolve("ok");
                }
            };

            com1.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com1.onIncoming(async function(message) {
                good();
                await message.wait();
                console.log(message.error);
                if (message.error !== com1.ERROR.INACTIVE) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();
            });
            com1.onInvoke(function(message) {
                reject(new Error("Unexpected"));
            });

            com2.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com2.onIncoming(async function(message) {
                reject(new Error("Unexpected"));
            });
            com2.onInvoke(async function(message) {
                reject(new Error("Unexpected"));
            });

            let message = com2.invoke(realData, [realData]);
            await message.wait();
            console.log(message.error);
            if (message.error !== com2.ERROR.TRANSFER_RECEIVE) {
                reject(new Error("Unexpected"));
                return;
            }
            good();
        });
    };
    console.log("Test 27...");
    await recieveProcedure(RandomArrayBuffer(10050));
    console.log("Test 27... OK");

    

    //test send error
    isNeedStop = false;
    com1.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
                console.log(data);
            }
            dropped.push({"com1": 0, "l": data.byteLength});
            await new Promise((resolve) => {
                setTimeout(resolve, 1);
            });
            com2.receive(data);
        },
        "interactTimeout": 500,

        "timeout": 1000,
        "packetSize": 100,
        "packetTimeout": 100,
        "packetRetry": 2,
        "sendThreads": 16
    });
    com2.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
                console.log(data);
            }
            if (isNeedStop) {
                throw new Error("Stopped");
                dropped.push({"com2": 1, "l": data.byteLength});
                return;
            }
            dropped.push({"com2": 0, "l": data.byteLength});
            await new Promise((resolve) => {
                setTimeout(resolve, 1);
            });
            com1.receive(data);
            isNeedStop = true;
        },
        "interactTimeout": 500,
        
        "timeout": 1000,
        "packetSize": 100,
        "packetTimeout": 100,
        "packetRetry": 2,
        "sendThreads": 16
    });
    const sendErrorProcedure = async function (data) {
        return new Promise(async (resolve, reject) => {
            dropped = [];
            //store reference values
            const realData = data;
            const realDataCopy = Copy(realData);
            const realModify = Modify(realData);
            const realModifyCopy = Modify(realData);

            //count attempts
            let goodAttempts = 0;
            const good = function () {
                goodAttempts++;
                if (goodAttempts === 3) {
                    resolve("ok");
                }
            };

            com1.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com1.onIncoming(async function(message) {
                good();
                await message.wait();
                console.log(message.error);
                if (message.error !== com1.ERROR.INACTIVE) {
                    reject(new Error("Unexpected"));
                    return;
                }
                good();
            });
            com1.onInvoke(function(message) {
                reject(new Error("Unexpected"));
            });

            com2.onSend(function(data) {
                reject(new Error("Unexpected"));
            });
            com2.onIncoming(async function(message) {
                reject(new Error("Unexpected"));
            });
            com2.onInvoke(async function(message) {
                reject(new Error("Unexpected"));
            });

            let message = com2.invoke(realData, [realData]);
            await message.wait();
            console.log(message.error);
            if (message.error !== com2.ERROR.TRANSFER_SEND) {
                reject(new Error("Unexpected"));
                return;
            }
            good();
        });
    };
    console.log("Test 28...");
    await sendErrorProcedure(RandomArrayBuffer(10050));
    console.log("Test 28... OK");

    
    //test long connectivity
    com1.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
            }
            await new Promise(function(resolve) {
                setTimeout(() => {
                    resolve();
                }, 1);
            });
            com2.receive(data);
        },
        "interactTimeout": 2000,

        "timeout": 600000,
        "packetSize": 100,
        "packetTimeout": 100,
        "packetRetry": 2,
        "sendThreads": 16
    });
    com2.configure({
        "sender": async function(data, transfer) {
            if (data instanceof ArrayBuffer) {
                data = new Uint8Array(new Uint8Array(data)).buffer;
            }
            await new Promise(function(resolve) {
                setTimeout(() => {
                    resolve();
                }, 1);
            });
            console.log(data);
            com1.receive(data);
        },
        "interactTimeout": 2001,

        "timeout": 600000,
        "packetSize": 1000,
        "packetTimeout": 1000,
        "packetRetry": 2,
        "sendThreads": 16
    });
    const sendLongProcedure = async function (data) {
        return new Promise(async (resolve, reject) => {
            //store reference values

            com2.onIncoming(async function(messageObj) {
                let a = 0;
                await messageObj.wait();
                while (messageObj.isInvoke === true) {
                    console.log(messageObj.isInvoke);
                    await new Promise((resolve) => {
                        setTimeout(resolve, 200);
                    });
                    messageObj.invoke("pong");
                    await messageObj.wait();
                    console.log(a++);
                }
            });

            const attempts = 20;
            let i = 0;
            let messageObj = com1.invoke("ping");
            while (i < attempts) {
                await messageObj.wait();
                console.log(messageObj.error);
                console.log(i);
                messageObj.invoke("ping");
                i++;
            };
            await messageObj.wait();
            messageObj = messageObj.send("end");
            await messageObj.wait();
            resolve("ok");
        });
    };
    console.log("Test 29...");
    await sendLongProcedure(RandomArrayBuffer(10050));
    console.log("Test 29... OK");
    return;
})();