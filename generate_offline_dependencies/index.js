const core = require('@actions/core');

const fs = require('fs');
const path = require('path');

const helpers = require('../lib/helpers.js');

const generator = core.getInput('generator') || 'Unix Makefiles';
const buildType = core.getInput('build_type') || 'Release';

async function run() {
    const tempPath = path.join(workspaceDir, '.offline', 'temp');
    try {
        await helpers.execWithLog('cmake', [
            '-S', workspaceDir,
            '-B', tempPath,
            '-G', generator,
            '-D', 'audacity_conan_allow_prebuilt_binaries=no',
            '-D', `CMAKE_BUILD_TYPE=${buildType}`,
            '-D', `CMAKE_CONFIGURATION_TYPES=${buildType}`,
            ...core.getMultilineInput('cmake_options')
        ]);
    } catch(error) {
        helpers.error(error.message);
        core.setFailed(error.message);
    } finally {
        await fs.promises.rm(tempPath, { recursive: true });

        await helpers.execWithLog('conan', [
            'remove',
            '*',
            '--src',
            '--builds',
            '--packages',
            '--force',
        ]);
    }
}

run()
