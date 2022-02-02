const core = require('@actions/core');
const artifact = require('@actions/artifact');

const fs = require('fs');
const path = require('path');

const helpers = require('../lib/helpers.js');

const offlineCacheLocation = path.join(workspaceDir, '.offline');
const pipDownloadCacheLocation = path.join(offlineCacheLocation, 'pip');
const conanVenvLocation = path.join(workspaceDir, '.venv');
const conanCacheLocation = path.join(offlineCacheLocation, 'conan');
const conanDownloadCacheLocation = path.join(conanCacheLocation, 'download_cache');

const packages = [
    'conan',
    'setuptools', 
    'wheel',
    'Cython',
    'setuptools_scm', 
    'flit_core'
]

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

async function prepareEnvironment(additionalPyhtonPackages) {
    let pip = await getPip();
    let python = await getPython();

    // Predowload packages
    await helpers.execWithLog(pip, [
        'download',
        '--dest', pipDownloadCacheLocation,
        '--no-binary=:all:',
        ...packages,
        ...(additionalPyhtonPackages || [])
    ]);
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
        'install', '--no-index', 
        '--find-links', pipDownloadCacheLocation,
        'setuptools', 'wheel', 'Cython'
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
