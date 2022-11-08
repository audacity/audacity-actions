const core = require('@actions/core');
const artifact = require('@actions/artifact');
const toolCache = require('@actions/tool-cache');

const fs = require('fs');
const path = require('path');

const helpers = require('../lib/helpers.js');

const offlineCacheLocation = path.join(workspaceDir, '.offline');
const conanCacheLocation = path.join(offlineCacheLocation, 'conan');
const conanDownloadCacheLocation = path.join(conanCacheLocation, 'download_cache');


async function downloadConan(version) {
    const cached_path = await toolCache.downloadTool(`https://github.com/audacity/conan-appimage/releases/download/v${version}/conan-${version}-x86_64.AppImage`)

    const bin_path = path.join(offlineCacheLocation, 'bin');

    if (!fs.existsSync(bin_path)) {
        fs.mkdirSync(bin_path, { recursive: true });
    }

    const conan_path = path.join(bin_path, 'conan');

    fs.copyFileSync(cached_path, conan_path);

    console.log(conan_path);
    fs.chmodSync(conan_path, '755');
    return conan_path;
}

async function prepareEnvironment() {
    conan = await downloadConan('1.54.0');

    core.exportVariable('CONAN_USER_HOME', conanCacheLocation);

    await helpers.execWithLog('conan', [
        'config', 'init'
    ]);

    await helpers.execWithLog(conan, [
        'config', 'set',
        `storage.download_cache=${conanDownloadCacheLocation}`
    ]);

    const compiler = (await helpers.getExecOutput(conan, ['profile', 'get', 'settings.compiler', 'default'])).stdout.trim();

    if (compiler === 'gcc') {
        await helpers.execWithLog(conan, [
            'profile',
            'update',
            'settings.compiler.libcxx=libstdc++11',
            'default',
        ])
    }
}

async function upload() {
    const revision = (await helpers.getExecOutput('git', ['show', '-s', '--format=%h'])).stdout.trim();

    const name = `audacity-dependencies-${helpers.getDateString()}+${revision}`;
    const tarball = `${name}.tar.gz`

    await helpers.execWithLog('tar', [
        'czf', tarball,
        '-C', workspaceDir,
        '.offline'
    ]);

    const artifactClient = artifact.create();
    await artifactClient.uploadArtifact(name, [ tarball ], workspaceDir);
}

module.exports = {
    prepareEnvironment: prepareEnvironment,
    upload: upload
}
