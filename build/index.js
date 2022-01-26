const core = require('@actions/core');

const os = require('os')

const BuildLevel = require('../lib/buildLevel.js');
const debug = require('../lib/debug.js');
const helpers = require("../lib/helpers.js");

const buildDir =  process.env['AUDACITY_BUILD_DIR'];
const buildType = process.env['AUDACITY_BUILD_TYPE'];
const buildLevel = BuildLevel.getBuildLevel();
const target = core.getInput('target')

async function buildAudacity() {
    let targetArgs = []

    if (target.length > 0) {
        targetArgs = [ '--target', target ]
    }

    const buildArgs = [
        '--build', buildDir,
        '-j', '' + os.cpus().length,
        '--config', buildType,
        ...targetArgs,
        ...core.getMultilineInput('cmake_options'),
    ]

    return helpers.execWithLog('cmake', buildArgs);
}

async function run() {
    try {
        await buildAudacity();

        const uploadSymbols = buildLevel != BuildLevel.Alpha;
        await debug.processDebugInformation(buildDir, buildType, uploadSymbols);
    } catch (error) {
        helpers.error(error.message);
        core.setFailed(error.message);
    }
}

run();
