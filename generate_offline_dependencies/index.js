const core = require('@actions/core');

const fs = require('fs');
const path = require('path');

const helpers = require('../lib/helpers.js');
const offlineDependencies = require('../lib/offlineDependencies.js')

const generator = core.getInput('generator') || 'Unix Makefiles';
const buildType = core.getInput('build_type') || 'Release';

async function run() {
    await offlineDependencies.prepareEnvironment();

    const tempPath = path.join(workspaceDir, '.offline', 'temp');

    try {
        await helpers.execWithLog('cmake', [
            '-S', workspaceDir,
            '-B', tempPath,
            '-G', generator,
            '-D', 'audacity_conan_allow_prebuilt_binaries=no',
            '-D', 'audacity_conan_force_build_dependencies=yes',
            '-D', `CMAKE_BUILD_TYPE=${buildType}`,
            '-D', `CMAKE_CONFIGURATION_TYPES=${buildType}`,
            ...core.getMultilineInput('cmake_options')
        ]);

        await fs.promises.rm(tempPath, { recursive: true });

        await helpers.execWithLog('conan', [
            'remove',
            '*',
            '--src',
            '--builds',
            '--packages',
            '--force',
        ]);

        await offlineDependencies.upload();
    } catch(error) {
        helpers.error(error.message);
        core.setFailed(error.message);
    }
}

run()
