const core = require('@actions/core');

const fs = require('fs');
const path = require('path');
const { config, arch } = require('process');

const yaml = require('yaml');

const conan = require('../lib/conan.js');
const helpers = require('../lib/helpers.js');

const recipesRemote = core.getInput('recipes_remote');
const login = core.getInput('login');
const password = core.getInput('password');
const defaultChannel = core.getInput('default_channel');
const skipUpload = core.getBooleanInput('skip_upload');

function getChannel(name) {
    if (defaultChannel.length > 0) {
        return defaultChannel;
    }

    const customChannels = {
        'expat' : 'audacity/stable',
        'libid3tag' : 'audacity/stable'
    };

    if (name in customChannels) {
        return customChannels[name];
    }

    return '';
}

async function addRemote(name, address, index) {
    if(address.length == 0) {
        return;
    }

    await helpers.execWithLog('conan', [
        'remote', 'add',
        name, address,
        '--force',
        '--insert', `${index}`,
    ]);

    await helpers.execWithLog('conan', [
        'user',
        '-p', password,
        '-r', name,
        login
    ]);
}

async function isConanPackage(name) {
    if (name.indexOf('.') == 0) {
        return false;
    }

    const fullPath = path.join(workspaceDir, name);
    const stat = await fs.promises.lstat(fullPath);

    if (!stat.isDirectory()) {
        return false;
    }

    return fs.existsSync(path.join(fullPath, 'config.yml'));
}

async function getPackageConfig(name) {
    const fullPath = path.join(workspaceDir, name);
    const configPath = path.join(fullPath, 'config.yml');

    const cfg = yaml.parse(fs.readFileSync(configPath, 'utf8'));

    return {
        'name': name,
        'versions': cfg.versions
    }
}

async function collectConanPackages() {
    const rootDirList = await fs.promises.readdir(workspaceDir);

    packages = []

    for (const listItem of rootDirList) {
        if(await isConanPackage(listItem)) {
            packages.push(await getPackageConfig(listItem));
        }
    }

    return packages
}

async function createPackage(name, version, folder) {
    const ref = `${name}/${version}@${getChannel(name)}`;

    await helpers.execWithLog('conan', [
        'create',
        path.join(workspaceDir, name, folder),
        ref,
        '--build=missing',
    ]);

    return ref;
}

async function uploadRecipe(ref) {
    await helpers.execWithLog('conan', [
        'upload', ref,
        '-no', 'recipe',
        '--confirm',
        '-r', 'recipes'
    ]);
}

async function getConanProfileValue(name) {
    return (await helpers.getExecOutput('conan', [
        'profile', 'get', name, 'default'
    ])).stdout.trim();
}

async function setConanProfileValue(name, value) {
    await helpers.execWithLog('conan', [
        'profile', 'update', `${name}=${value}`, 'default'
    ]);
}

async function run() {
    await conan.setupConan();

    // Setup remotes
    await addRemote('recipes', recipesRemote, 0);

    // Setup default profile
    await helpers.execWithLog('conan', [
        'profile', 'new', 'default',
        '--detect', '--force'
    ]);

    if (process.platform === 'darwin') {
        const conanHostArch = await getConanProfileValue('settings.arch');

        // macOS will ignore crosscompilation otherwise
        if (conanHostArch === 'armv8' && process.arch !== 'arm64') {
            core.exportVariable('CONAN_CMAKE_SYSTEM_NAME', 'Darwin');
            core.exportVariable('CONAN_CMAKE_SYSTEM_PROCESSOR', 'arm64');
        }
    } else if (process.platform === 'win32') {
        if ((await getConanProfileValue('settings.compiler')) == 'msvc') {
            await setConanProfileValue('settings.compiler.runtime', 'dynamic');
            await setConanProfileValue('settings.compiler.runtime_type', 'Release');
            await setConanProfileValue('settings.compiler.cppstd', '17');
        }
    }

    const packagesList = await collectConanPackages();

    for (const packageConfig of packagesList) {
        for (const version in packageConfig.versions) {
            const ref = await createPackage(
                packageConfig.name,
                version,
                packageConfig.versions[version].folder
            );

            if (!skipUpload && recipesRemote.length > 0) {
                await uploadRecipe(ref);
            }
        }
    }
}

run()
