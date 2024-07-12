const helpers = require('../lib/helpers.js');
const fileUtils = require('./fileUtils.js');

const entitlements = `${workspaceDir}/mac/Audacity.entitlements`;

async function signFile(file, identity, args) {
    args = args || [];

    return helpers.execWithLog('xcrun', [
        'codesign', '--verbose=3',
        '--timestamp',
        '--sign', identity,
        '--options', 'runtime',
        '--entitlements', entitlements,
        '--force',
        ...args,
        file
    ]);
}

async function fixupRPath(file) {
    const output = (await helpers.getExecOutput('otool', ['-L', file])).stdout;

    const libs = output.split('\n').
        filter(line => line.indexOf('@rpath') != -1).
        map(line => line.match(/@rpath\/.+\.dylib/)[0]);

    if (libs.length == 0) {
        return;
    }

    const loaderCommands =
        (await helpers.getExecOutput('otool', ['-l', file])).stdout.
            split('\n').
            map(line => line.trim()).
            filter(line => line.search(/path\s+@(?:executable|loader)_path/) != -1).
            map(line => line.match(/path\s+(@(?:executable|loader)_path.*)\s+\(/)[1]).
            map(line => ['-delete_rpath', line]).flat(Infinity);


    const nameToolArgs = libs.map(lib => {
        return ['-change', lib, lib.replace('@rpath', '@executable_path/../Frameworks') ]
    }).flat(Infinity);

    helpers.log(`Fixing rpath for ${file}`);

    return helpers.execWithLog('install_name_tool', [
        ...nameToolArgs,
        ...loaderCommands,
        file
    ])

}

async function singApp(appLocation, identity) {
    if (!identity) {
        helpers.log("Skipping code signings, as there is no codesign identity provided");
        return ;
    }

    const bundleContens = await fileUtils.getAudacityMacOSBundleFiles(appLocation);

    exeFiles = bundleContens.MacOS;
    modules = bundleContens.modules;
    frameworks = bundleContens.Frameworks.dylib;

    binaries = [ ...exeFiles, ...modules, ...frameworks ];

    for (const file of binaries) {
        await fixupRPath(file);
    }

    for (const file of [/*...exeFiles,*/ ...modules]) {
        await signFile(file, identity);
    }

    await signFile(appLocation, identity, [ '--deep' ]);

    // Validate the signautre
    await helpers.execWithLog('codesign', [
        '--verify',
        '--deep',
        '--verbose=4',
        '--strict',
        appLocation
    ])
}

async function signDMG(dmgPath, appIdentifier, codesignIdentifier) {
    if (!codesignIdentifier) {
        helpers.log("Skipping code signings, as there is no codesign identity provided");
        return ;
    }

    await helpers.execWithLog('xcrun', [
        'codesign', '--verbose',
        '--timestamp',
        '--identifier', appIdentifier,
        '--sign', codesignIdentifier,
        dmgPath
    ]);
}

async function notarizeDMG(dmgPath, notarizationUser, notarizationPassword, notarizationTeamId) {
    if (!notarizationUser || !notarizationUser || !notarizationTeamId) {
        helpers.log("Skipping notarization, as there are no credentials provided");
        return ;
    }

    helpers.log(`Notarizing DMG: ${dmgPath}`)

    const notarizationResult = await helpers.getExecOutput('xcrun', [
        'notarytool', 'submit',
        '--apple-id',  notarizationUser,
        '--team-id', notarizationTeamId,
        '--password', notarizationPassword,
        '--output-format', 'json',
        '--wait', dmgPath
    ]);

    const parsedResult = JSON.parse(notarizationResult.stdout);

    const notarizationLog = await helpers.getExecOutput('xcrun', [
        'notarytool', 'log',
        '--apple-id',  notarizationUser,
        '--team-id', notarizationTeamId,
        '--password', notarizationPassword,
        parsedResult["id"]
    ]);

    helpers.log(notarizationLog.stdout);

    if (parsedResult["status"] != "Accepted") {
        throw Error(`Notarization failed: ${parsedResult["status"]}`);
        //helpers.log(`Notarization failed: ${parsedResult["status"]}`);
        //return;
    }

    await helpers.execWithLog('xcrun', ["stapler", "staple", dmgPath]);

    helpers.log(`Notarizing was successful: ${dmgPath}`)
}

module.exports = {
    singApp: singApp,
    signDMG: signDMG,
    notarizeDMG: notarizeDMG,
}
