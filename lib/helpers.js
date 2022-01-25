const core = require('@actions/core');
const exec = require('@actions/exec');

const path = require('path');

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

async function execWithLog(programm, arguments) {
    if (runningOnCI) {
        return exec.exec(programm, arguments);
    } else {
        return exec.exec(programm, arguments, {
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

async function getExecOutput(programm, arguments) {
    if (runningOnCI) {
        return exec.getExecOutput(programm, arguments);
    } else {
        return exec.getExecOutput(programm, arguments, {
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

const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

process.on('unhandledRejection', (reason, p) => {
    error(reason);
    core.setFailed(err);
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
}
