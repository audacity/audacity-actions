const path = require('path');
const fs = require('fs');

const core = require('@actions/core');
const exec = require('@actions/exec');
const cache = require('@actions/cache');
const glob = require('@actions/glob');

const helpers = require("../lib/helpers.js")

async function getStdOut(...args) {
    let result = await exec.getExecOutput(...args);
    return result.stdout.trim();
}

async function getConanVersion() {
    let conanVersionString = await getStdOut('conan', ['--version']);
    return conanVersionString.match(/[\d]+\.[\d]+\.[\d]+/g)[0]
}

async function getCompilerVersion(generator) {
    if (process.platform === 'win32') {
        return 'msvc-' + generator.match(/[\d]+/g)[0];
    } else if (process.platform === 'darwin') {
        return 'clang-' + await getStdOut('clang', ['-dumpversion'])
    } else {
        return 'gcc-' + await getStdOut('gcc', ['-dumpfullversion'])
    }
}

async function getConanCacheKeys(generator) {
    const depsFile = path.join(workspaceDir, 'cmake-proxies/CMakeLists.txt');
    const depsMD5 = helpers.getMD5(depsFile);

    const conanVersion = await getConanVersion();

    const conanCacheKeyShort = [
        'conan', conanVersion,
        process.platform,
        await getCompilerVersion(generator)
    ].join('-');

    const conanCacheKey = [conanCacheKeyShort, depsMD5].join('-');

    return { key: conanCacheKey, restoreKeys : [conanCacheKeyShort] }
}

async function restoreConanCache(key) {
    // Try to restore the conan cache
    try {
        return key.key == await cache.restoreCache([ conanCachePath ], key.key, key.restoreKeys);
    } catch (error) {
        helpers.log('Failed to restore the cache: ' + error.message);
        return false;
    }
}

async function cleanupConanBuilds() {
    helpers.log("Cleaning up conan build cache");
    await helpers.execWithLog('conan cache clean "*"')
}

async function storeConanCache(key) {
    try {
        await cache.saveCache([ conanCachePath ], key.key);
    } catch (error) {
        helpers.error('Failed to save the cache: ' + error.message);
    }
}

async function setupConan() {
    core.exportVariable('CONAN_HOME', `${workspaceDir}/.conan`);
}

module.exports = {
    setupConan: setupConan,
    getConanCacheKeys: getConanCacheKeys,
    restoreConanCache: restoreConanCache,
    cleanupConanBuilds: cleanupConanBuilds,
    storeConanCache: storeConanCache,
}
