const core = require('@actions/core');
const exec = require('@actions/exec');

const path = require('path');
const md5 = require('md5');
const fs = require('fs');

const runningOnCI = process.env['CI']

global.workspaceDir = process.env['GITHUB_WORKSPACE']
global.conanCachePath = path.join(workspaceDir, '.conan')

function log(msg) {
    if (runningOnCI) {
        core.info(msg);
    } else {
        console.log(msg);
    }
}

function error(msg) {
    if (runningOnCI) {
        core.error(msg);
    } else {
        console.error(msg);
    }
}

async function execWithLog(programm, args) {
    if (runningOnCI) {
        return exec.exec(programm, args);
    } else {
        return exec.exec(programm, args, {
            listeners: {
                /*debug: data => {
                    log(data);
                },*/
                stdout: data => {
                    log(data.toString());
                },
                stderr: data => {
                    error(data.toString());
                }
            }
        });
    }
}

async function getExecOutput(programm, args) {
    if (runningOnCI) {
        return exec.getExecOutput(programm, args);
    } else {
        return exec.getExecOutput(programm, args, {
            listeners: {
                stdout: data => {
                    log(data.toString());
                },
                stderr: data => {
                    error(data.toString());
                }
            }
        });
    }
}

async function awaitAll(array, functor) {
    return await Promise.all(array.map(async (item) => functor(item)))
}

async function getMD5(filePath) {
    const depsContent = await fs.promises.readFile(filePath);
    return md5(depsContent);
}

function getDateString() {
    const currentDate = new Date();

    return [
        currentDate.getFullYear(),
        ('0' + (currentDate.getMonth() + 1)).slice(-2),
        ('0' + currentDate.getDate()).slice(-2)
        ].join('')
}

const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

process.on('unhandledRejection', (reason, p) => {
    error(reason);
    core.setFailed(reason);
    process.exit(1);
}).on('uncaughtException', err => {
    error(err);
    core.setFailed(err);
    process.exit(1);
});

module.exports = {
    log: log,
    error: error,
    execWithLog: execWithLog,
    getExecOutput: getExecOutput,
    sleep: sleep,
    awaitAll: awaitAll,
    getMD5: getMD5,
    getDateString: getDateString,
}
