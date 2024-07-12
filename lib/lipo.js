const path = require('path');

const helpers = require('../lib/helpers.js');
const fileUtils = require('../lib/fileUtils.js');
const fs = require('fs');

async function create (targetPath, inputBundles) {
    firstBundle = await fileUtils.getAudacityMacOSBundleFiles(inputBundles[0]);
    await fileUtils.copyFiles(inputBundles[0], firstBundle.misc, targetPath);

    // Audacity creates empty en.lproj directory in the bundle
    enlprojPath = path.join(targetPath, 'Contents', 'Resources', 'en.lproj');
    if (!fs.existsSync(enlprojPath)) {
        fs.mkdirSync(enlprojPath, { recursive: true });
    }

    const binaries = [
        ...firstBundle.MacOS,
        ...firstBundle.Frameworks.dylib,
        ...firstBundle.modules
    ]

    return helpers.awaitAll(binaries, file => {
        const relativePath = path.relative(inputBundles[0], file);

        const files = inputBundles.map(appPath => path.join(appPath, relativePath));

        const fatBinaryPath = path.join(targetPath, relativePath);
        const fatBinaryParent = path.dirname(fatBinaryPath);

        if (!fs.existsSync(fatBinaryParent)) {
            fs.mkdirSync(fatBinaryParent, { recursive: true });
        }

        return helpers.execWithLog('lipo', [
            '-create',
            '-output', fatBinaryPath,
            ...files
        ]);
    });
}

async function archs(appPath) {
    const MacOS = path.join(appPath, 'Contents', 'MacOS');
    const binary = path.join(MacOS, fs.readdirSync(MacOS)[0]);

    return (await helpers.getExecOutput('lipo', [
        '-archs', binary
    ])).stdout.split(/\s+/).map(arch => arch.trim()).filter(arch => arch.length > 0);
}

async function archSuffix(appPath) {
    const list = await archs(appPath);

    if (list.length == 1) {
        return list[0];
    } else {
        return "universal";
    }
}

module.exports = {
    create: create,
    archs: archs,
    archSuffix: archSuffix
}
