const core = require('@actions/core');

const fs = require('fs');
const path = require('path');

const helpers = require('../lib/helpers.js');

const offlineCacheLocation = path.join(workspaceDir, '.offline');
const pipDownloadCacheLocation = path.join(offlineCacheLocation, 'pip');
const conanVenvLocation = path.join(workspaceDir, '.venv');
const conanCacheLocation = path.join(offlineCacheLocation, 'conan');
const conanDownloadCacheLocation = path.join(conanCacheLocation, 'download_cache');

async function getPip() {
    try {
        await helpers.execWithLog('pip3', ['--version']);
        return 'pip3';
    } catch(e) {
        await helpers.execWithLog('pip', ['--version']);
        return 'pip';
    }
}

async function getPython() {
    try {
        await helpers.execWithLog('python3', ['--version']);
        return 'python3';
    } catch(e) {
        await helpers.execWithLog('python', ['--version']);
        return 'python';
    }
}

async function run() {
    let pip = await getPip();
    let python = await getPython();

    // Prepare venev
    if (fs.existsSync(conanVenvLocation)) {
        await fs.promises.rm(conanVenvLocation, { recursive: true, force: true });
    }

    await helpers.execWithLog(python, [
        '-m', 'venv', conanVenvLocation
    ]);

    core.exportVariable('VIRTUAL_ENV', conanVenvLocation);
    
    pip =    path.join(conanVenvLocation, 'bin', pip   );
    python = path.join(conanVenvLocation, 'bin', python);

    await fs.promises.mkdir(pipDownloadCacheLocation, { recursive: true });

    await helpers.execWithLog(pip, [
        'download',
        '--dest', pipDownloadCacheLocation,
        'conan==1.43.2', 'setuptools', 'wheel', 'Cython'
    ]);

    await helpers.execWithLog(pip, [
        'install', '--no-index', 
        '--find-links', pipDownloadCacheLocation,
        'conan'
    ]);

    core.addPath(path.join(conanVenvLocation, 'bin'));

    core.exportVariable('CONAN_USER_HOME', conanCacheLocation);

    await helpers.execWithLog('conan', [
        'config', 'init'
    ]);

    await helpers.execWithLog('conan', [
        'config', 'set',
        `storage.download_cache=${conanDownloadCacheLocation}`
    ]);

    const compiler = (await helpers.getExecOutput('conan', ['profile', 'get', 'settings.compiler', 'default'])).stdout.trim();

    if (compiler === 'gcc') {
        await helpers.execWithLog('conan', [
            'profile',
            'update',
            'settings.compiler.libcxx=libstdc++11',
            'default',
        ])
    }
}

run();
