const core = require('@actions/core');
const artifact = require('@actions/artifact');

const fs = require('fs');
const path = require('path');
const extractZip = require('extract-zip');

const plist = process.platform === 'darwin' ? require('simple-plist') : {};
const dmgUtils = process.platform === 'darwin' ? require('../lib/dmgUtils.js') : {};
const appleCodeSigning = process.platform === 'darwin' ? require('../lib/appleCodeSigning.js') : {};

const fileUtils = require('../lib/fileUtils.js');
const BuildLevel = require('../lib/buildLevel.js');
const helpers = require("../lib/helpers.js");

const lipo = require('../lib/lipo.js');

const buildDir =  process.env['AUDACITY_BUILD_DIR'];
const buildType = process.env['AUDACITY_BUILD_TYPE'];
const buildLevel = BuildLevel.getBuildLevel();
const arch = process.env['AUDACITY_ARCH'] || 'x64';

const universalArchitectures = core.getMultilineInput("archs");
const postfix = core.getInput('postfix');

if (universalArchitectures.length == 0) {
    universalArchitectures.push(arch);
}

const codesignIdentifier = core.getInput('apple_codesign_identity');
const userName = core.getInput('apple_notarization_user_name');
const password = core.getInput('apple_notarization_password');
const teamId = core.getInput('apple_notarization_team_id');

async function packageAudacity(target) {
    const buildArgs = [
        '--build', buildDir,
        '--target', target,
        '--config', buildType,
        ...core.getMultilineInput('cmake_options'),
    ];

    const retriesCount = process.platform === 'darwin' ? 10 : 2;

    for (let i = 1; i < retriesCount; i++) {
        try {
            return await helpers.execWithLog('cmake', buildArgs);
        } catch (err) {
            helpers.error(`Packaging attempt #${i} failed: ${err.message}`);
            await helpers.sleep(2000 * i);
        }
    }

    return await helpers.execWithLog('cmake', buildArgs);
}

async function installAudacity(buildArch) {
    const buildDir = path.join(workspaceDir, `.build.${buildArch}`);
    const installDir = path.join(workspaceDir, '.package', '_CPack_Packages', buildArch)

    const buildArgs = [
        '--install', buildDir,
        '--config', buildType,
        '--prefix', installDir,
        ...core.getMultilineInput('cmake_options'),
    ];

    await helpers.execWithLog('cmake', buildArgs);

    if(codesignIdentifier.length > 0) {
        const apps = await fileUtils.listMacosApps(installDir);

        for (const app of apps) {
            await appleCodeSigning.singApp(app, codesignIdentifier);
        }
    }

    return installDir;
}

async function getBuildSuffix() {
    if(buildLevel == BuildLevel.Release) {
        return '';
    }

    const currentDate = new Date();
    const dateString = date = [
        currentDate.getFullYear(),
        ('0' + (currentDate.getMonth() + 1)).slice(-2),
        ('0' + currentDate.getDate()).slice(-2)
        ].join('')

    const revision = (await helpers.getExecOutput('git', ['show', '-s', '--format=%h'])).stdout.trim();

    return `-${BuildLevel.getBuildSuffix(buildLevel)}-${dateString}+${revision}`;
}

async function packageApp(app, suffix, packageDir) {
    const plistData = plist.readFileSync(path.join(app, 'Contents', 'Info.plist'));
    const version = plistData['CFBundleVersion'].match(/[1-9]+\.[0-9]+\.[0-9]+/)[0];
    const dmgName = `audacity-macOS-${version}${suffix}-${await lipo.archSuffix(app)}.dmg`
    const dmgPath = path.join(packageDir, dmgName);

    await dmgUtils.packageDMG(dmgPath, app);

    if (codesignIdentifier.length > 0) {
        const bundleIdentifier = plistData['CFBundleIdentifier'];
        await appleCodeSigning.signDMG(dmgPath, bundleIdentifier, codesignIdentifier);

        if (userName !== '' && password !== '' && buildLevel != BuildLevel.Alpha) {
            await appleCodeSigning.notarizeDMG(dmgPath, userName, password, teamId);
        }
    }
}

async function run() {
    try {
        const isMacos = process.platform === 'darwin';

        const packageDir = isMacos ?
            path.join(workspaceDir, '.package') :
            path.join(buildDir, 'package');

        const internalPackagesDir = path.join(packageDir, '_CPack_Packages');

        if (fs.existsSync(internalPackagesDir)) {
            await fs.promises.rm(internalPackagesDir, {
                recursive: true,
                force: true,
            });
        }

        if (buildLevel != BuildLevel.Alpha && process.platform === 'win32') {
            await packageAudacity('innosetup');
        }

        if (!isMacos) {
            await packageAudacity('package');
        } else {
            // Packaging DMG is highly unreliable with CMake
            // when performed on CI
            for(const architecture of universalArchitectures) {
                await installAudacity(architecture);
            }

            const apps = await fileUtils.listMacosApps(internalPackagesDir);

            const suffix = await getBuildSuffix();

            if (apps.length > 1) {
                const universalPath = path.join(internalPackagesDir, 'universal', path.basename(apps[0]));

                await lipo.create(universalPath, apps);
                await appleCodeSigning.singApp(universalPath, codesignIdentifier);
                apps.push(universalPath)
            }

            for (const app of apps) {
                await packageApp(app, suffix, packageDir);
            }
        }

        await fs.promises.rm(internalPackagesDir, {
            recursive: true,
            force: true,
        });

        const filesList = await fs.promises.readdir(packageDir);

        const artifactClient = new artifact.DefaultArtifactClient();
        
        const filesByArtifactName = {};
        
        for(const file of filesList) {
            const ext = path.extname(file);
            const name = path.basename(file, ext);
            const artifactName = `${name}${postfix}`;

            if (!filesByArtifactName[artifactName]) {
                filesByArtifactName[artifactName] = [];
            }

            if (ext === '.zip') {
                await extractZip(path.join(packageDir, file), { dir: packageDir });
                const filesList = await fileUtils.listDirectory(path.join(packageDir, name));
                filesByArtifactName[artifactName] = filesByArtifactName[artifactName].concat(filesList);
            } else {
                filesByArtifactName[artifactName].push(path.join(packageDir, file));
            }
        }
        for (const artifactName in filesByArtifactName) {
            const fileList = filesByArtifactName[artifactName];
            helpers.log(`Starting upload of files ${fileList} as ${artifactName}`);
            await artifactClient.uploadArtifact(artifactName, fileList, packageDir);
        }
    } catch (error) {
        helpers.error(error.message);
        core.setFailed(error.message);
    }
}

run();
