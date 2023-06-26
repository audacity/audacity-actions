const core = require('@actions/core');

const path = require('path');

const BuildLevel = require('../lib/buildLevel.js');
const conan = require('../lib/conan.js');
const debug = require('../lib/debug.js');
const helpers = require('../lib/helpers.js');

const generator = core.getInput('generator');
const disableConanCache = core.getInput('use_conan_cache') != 'true';

const hostArch = core.getInput('arch');
const buildArch = process.arch;

const isVisualStudio = generator.startsWith('Visual Studio');
const isXcode = generator.startsWith('Xcode');
const isMultiConfig = isVisualStudio || isXcode;

let buildDir = path.join(workspaceDir, '.build.' + hostArch);

const buildLevel = BuildLevel.getBuildLevel();
const buildType = core.getInput('build_type');

function getMSVCConfiguration() {
    let cmakeOptions = [ ];

    if (hostArch == 'x32') {
        cmakeOptions = [...cmakeOptions, '-A', 'Win32',];
    } else if (hostArch == 'x64') {
        cmakeOptions = [...cmakeOptions, '-A', 'x64',];
    } else {
        throw new Error('Invalid host architecture');
    }

    const windowsCertificate = core.getInput('windows_certificate');
    const windowsCertificatePassword = core.getInput('windows_certificate_password');

    if (windowsCertificate !== '' && windowsCertificatePassword !== '') {
        core.exportVariable('WINDOWS_CERTIFICATE', windowsCertificate);
        core.exportVariable('WINDOWS_CERTIFICATE_PASSWORD', windowsCertificatePassword);

        cmakeOptions = [...cmakeOptions, '-Daudacity_perform_codesign=yes'];
    }

    return cmakeOptions
}

function getXcodeConfiguration() {
    let cmakeOptions = [ ];

    if (hostArch == 'arm64') {
        cmakeOptions = [...cmakeOptions, '-DMACOS_ARCHITECTURE=arm64']
        // TODO: Check for unsafe cross-compilation...
    } else if (hostArch == 'x64') {
        cmakeOptions = [...cmakeOptions, '-DMACOS_ARCHITECTURE=x86_64']
    } else {
        throw new Error('Invalid host architecture');
    }

    const appleCodeSignIdentity = core.getInput('apple_codesign_identity');

    if (appleCodeSignIdentity !== '') {
        cmakeOptions = [...cmakeOptions,
            '-Daudacity_perform_codesign=yes',
            `-DAPPLE_CODESIGN_IDENTITY=${appleCodeSignIdentity}`
        ]

        if (buildLevel != BuildLevel.Alpha) {
            const userName = core.getInput('apple_notarization_user_name');
            const password = core.getInput('apple_notarization_password');

            if (userName !== '' && password !== '') {
                cmakeOptions = [...cmakeOptions,
                    `-DAPPLE_NOTARIZATION_USER_NAME=${userName}`,
                    `-DAPPLE_NOTARIZATION_PASSWORD=${password}`,
                    '-Daudacity_perform_notarization=yes',
                ]
            }
        }
    }

    const imageCompiler = core.getInput("image_compiler") || '';

    if (imageCompiler.length > 0) {
        cmakeOptions = [
            ...cmakeOptions,
            `-DIMAGE_COMPILER_EXECUTABLE=${imageCompiler}`
        ]
    }


    return cmakeOptions;
}

function getConfigurationOptions() {
    let cmakeOptions = [
        '-S', workspaceDir,
        '-B', buildDir,
        '-G', generator,
        `-DCMAKE_BUILD_TYPE=${buildType}`,
        // Some CI defaults
        '-Daudacity_use_pch=no',
        '-Daudacity_has_networking=yes',
        '-Daudacity_has_updates_check=yes',
        '-DSHOW_WHATS_NEW_SECTION=yes',
        `-DAUDACITY_BUILD_LEVEL=${buildLevel}`,
        `-DAUDACITY_ARCH_LABEL=${hostArch}`
    ];

    if (isMultiConfig) {
        cmakeOptions = [...cmakeOptions,
            '-DCMAKE_CONFIGURATION_TYPES=' + core.getInput('configuration_types'),
        ]
    }

    if (isVisualStudio) {
        cmakeOptions = [...cmakeOptions, ...getMSVCConfiguration()]
    } else if (isXcode) {
        cmakeOptions = [...cmakeOptions, ...getXcodeConfiguration()]
    }

    //if (buildLevel == BuildLevel.Release) {
    //    cmakeOptions = [...cmakeOptions,  '-Daudacity_package_manual=yes' ]
    //}

    return [...cmakeOptions, ...core.getMultilineInput('cmake_options')]
}

async function configureAudacity() {
    return helpers.execWithLog('cmake', getConfigurationOptions());
}

async function run() {
    try {
        await conan.setupConan();

        core.exportVariable('AUDACITY_BUILD_DIR', buildDir);
        core.exportVariable('AUDACITY_BUILD_TYPE', core.getInput('build_type'));
        core.exportVariable('AUDACITY_BUILD_LEVEL', buildLevel);
        core.exportVariable('AUDACITY_ARCH', hostArch);
        core.exportVariable('AUDACITY_CROSS_COMPILING', buildArch !== hostArch);

        const conanCacheKey = await conan.getConanCacheKeys(generator);
        const saveCache = !disableConanCache && await conan.restoreConanCache(conanCacheKey);

        try{
            await configureAudacity();
            await conan.cleanupConanBuilds();
        } catch(error) {
            helpers.error(error.message);
            core.setFailed(error.message);
        } finally {
            if (saveCache) {
                await conan.storeConanCache(conanCacheKey);
            }
        }
    } catch (error) {
        helpers.error(error.message);
        core.setFailed(error.message);
    }
}

run();
