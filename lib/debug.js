const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const glob = require('@actions/glob');
const toolCache = require('@actions/tool-cache')

const helpers = require("../lib/helpers.js");
const fileUtils = require("../lib/fileUtils.js");

const artifactorySymbolsURL = process.env['ARTIFACTORY_SYMBOLS_URL'];
const artifactorySymbolsKey = process.env['ARTIFACTORY_SYMBOLS_KEY'];

const symstore = 'C:\\Program Files (x86)\\Windows Kits\\10\\Debuggers\\x64\\symstore.exe';
const symstoreFound = process.platform === 'win32' && fs.existsSync(symstore);

const debugDir = path.join(workspaceDir, '.debug')
const symstoreDir = path.join(debugDir, 'SymStore')

async function getSentryCli() {
    let sentryCliPath = ''

    try {
        if (process.platform === 'win32') {
            sentryCliPath = await toolCache.downloadTool('https://downloads.sentry-cdn.com/sentry-cli/1.71.0/sentry-cli-Windows-x86_64.exe');
        }
        else if (process.platform === 'darwin') {
            sentryCliPath = await toolCache.downloadTool('https://downloads.sentry-cdn.com/sentry-cli/1.71.0/sentry-cli-Darwin-universal');
        }
        else {
            sentryCliPath = await toolCache.downloadTool('https://downloads.sentry-cdn.com/sentry-cli/1.71.0/sentry-cli-Linux-x86_64');
        }

        const name = process.platform === 'win32' ? 'sentry-cli.exe' : 'sentry-cli';

        const renamedPath = path.join(
            path.dirname(sentryCliPath),
            name
        );

        await fs.promises.rename(sentryCliPath, renamedPath)

        if (process.platform !== 'win32') {
            await fs.promises.chmod(renamedPath, '0766');
        }

        return renamedPath;
    } catch (err) {
        helpers.error(err);
        return '';
    }
}

const sentryConfig = {
    authToken: process.env['SENTRY_AUTH_TOKEN'] || '',
    url: 'https://' + process.env['SENTRY_HOST'],
    org: process.env['SENTRY_ORG_SLUG'] || '',
    project: process.env['SENTRY_PROJECT_SLUG'] || '',
    cliInitialized: false,
    cliFound: false,
}

const sentryConfigMayBeValid =
    sentryConfig.authToken.length > 0 &&
    sentryConfig.url.length > 0 &&
    sentryConfig.org.length > 0 &&
    sentryConfig.project.length > 0;

async function download(artifactoryUrl, file, symstoreDir) {
    const response = await fetch(artifactoryUrl + file);

    if (!response.ok) {
        return false;
    }

    try {
        await new Promise((resolve, reject) => {
            let targetFilePath = path.join(symstoreDir, file);
            let basePath = path.dirname(targetFilePath);

            if (!fs.existsSync(basePath)) {
                fs.mkdirSync(basePath, { recursive: true })
            }

            const fileStream = fs.createWriteStream(targetFilePath);
            response.body.pipe(fileStream);

            response.body.on("error", (err) => {
                reject(err);
            });


            fileStream.on("finish", function() {
                resolve();
            });
        });

        return true;
    } catch (err) {
        return false;
    }
}

async function download000Admin(targetPath) {
    if(await download(artifactorySymbolsURL, '000Admin/lastid.txt', targetPath)) {
        await download(artifactorySymbolsURL, '000Admin/history.txt', targetPath);
        await download(artifactorySymbolsURL, '000Admin/server.txt', targetPath);
    }
}

async function uploadSymStore() {
    await download000Admin();

    const files = await fileUtils.listDirectory(symstoreDir);

    for(const file of files) {
        let url = artifactorySymbolsURL + path.relative(symstoreDir, file).replaceAll(path.sep, '/');

        helpers.log(`Uploading ${url}`);

        let fileData = fs.createReadStream(file);

        try {
            let response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer ' + artifactorySymbolsKey,
                },
                body: fileData
            })

            if (!response.ok) {
                helpers.error("Failed to upload " + response.status);
            }
        } catch (err) {
            helpers.error(err);
        }
    }
}

async function uploadAllToSentry(files) {
    if (!sentryConfig.cliInitialized) {
        sentryConfig.cliInitialized = true;
        sentryConfig.cli = await getSentryCli();
        sentryConfig.cliFound = sentryConfig.cli.length > 0;

        if (!sentryConfig.cliFound) {
            helpers.error("sentry-cli is not available");
            return;
        }
    }

    if (sentryConfig.cliFound && sentryConfigMayBeValid) {
        for (const filePath of files) {
            await helpers.execWithLog(sentryConfig.cli, [
                '--auth-token', sentryConfig.authToken,
                '--url', sentryConfig.url,
                'upload-dif', '--include-sources',
                '--org', sentryConfig.org,
                '--project', sentryConfig.project,
                filePath
            ]);
        }
    }
}

async function addToSymStore(fileName) {
    if (symstoreFound) {
        await helpers.execWithLog('"' + symstore + '"', [
            'add',
            '/s', symstoreDir,
            '/compress', '/r', '/f',
            fileName,
            '/t', path.basename(fileName, '.pdb')
        ])
    }
}

async function splitDsymFile(file) {
    if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
    }

    helpers.log(`Calling dsymutil on ${file}`)

    let dsymPath = path.join(debugDir, path.basename(file) + '.dSYM')

    await helpers.execWithLog('dsymutil', [file, '-o', dsymPath]);

    return dsymPath;
}

const doNotStrip = [
    /libicu.+/
]

function skipSplit(file) {
    for (const pattern of doNotStrip) {
        if (file.match(pattern)) {
            return true;
        }
    }

    return false;
}

async function splitDebugFile(file) {
    if (skipSplit(file)) {
        return '';
    }

    if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
    }

    let debugPath = path.join(debugDir, path.basename(file) + '.debug')

    try {
        await helpers.execWithLog('objcopy', ['--only-keep-debug', '--compress-debug-section=zlib', file, debugPath]);

        if (!fs.existsSync(debugPath)) {
            return '';
        }

        await helpers.execWithLog('objcopy', ['--strip-debug', '--strip-unneeded', file]);
        await helpers.execWithLog('objcopy', ['--add-gnu-debuglink=' + debugPath, file]);

        return debugPath;
    } catch (err) {
        helpers.error(err);
        return '';
    }
}


async function getMatchingFiles(mainPatterns, controlPatterns, skipExt) {
    const mainFiles = await fileUtils.globFiles(mainPatterns);
    const controlFiles = await fileUtils.globFiles(controlPatterns);

    return mainFiles.filter(file => {
        const buildFile = !skipExt ?
            path.basename(file) :
            path.basename(file, path.extname(file));

        return controlFiles.findIndex(value => value.indexOf(buildFile) != -1) != -1;
    });
}

async function splitDepsDebugSymbols(extension, splitter, performUpload) {
    const files = await getMatchingFiles(
        path.join(conanCachePath, 'data/**/package/**/*' + extension),
        path.join(conanCachePath, 'data/**/build/**/*' + extension)
    );

    let debugFiles = []

    for(const file of files) {
        const debugPath = await splitter(file);

        if (debugPath.length > 0) {
            debugFiles.push(debugPath);
        }
    }

    if (performUpload && debugFiles.length > 0) {
        await uploadAllToSentry([...debugFiles, ...files])
    }
}

async function splitAudacityDebugSymbols(buildDir, buildType, extension, splitter, performUpload) {
    const binDir = path.join(buildDir, 'bin', buildType);

    // Find all executable files, that
    // do not have an extesion
    const executableFiles = (await fileUtils.globFiles(`${binDir}/**/*`)).filter(file => {
        const stat = fs.lstatSync(file);
        return stat.isFile() && (stat.mode & fs.constants.S_IXUSR) && path.extname(file).length == 0;
    })

    const systemLibraries = await getMatchingFiles(
        `${binDir}/**/*${extension}`,
        `${conanCachePath}/**/package/**/*${extension}`);

    const libraries = (await fileUtils.globFiles(`${binDir}/**/*${extension}`)).filter(file => {
        const stat = fs.lstatSync(file);

        if (!stat.isFile())
            return false;

        return systemLibraries.indexOf(file) == -1;
    });

    const binaries = [...executableFiles, ...libraries]

    let debugFiles = []

    for(const file of binaries) {
        const debugPath = await splitter(file);

        if (debugPath.length > 0) {
            debugFiles.push(debugPath);
        }
    }

    if (performUpload && debugFiles.length > 0) {
        await uploadAllToSentry([...debugFiles, ...binaries])
    }
}

async function processDependenciesDebugInformation(buildDir, buildType, performUpload) {
    if (process.platform == 'win32') {
        // On Windows, nothing needs to be done
        // if we are processeing dependencies and
        // no upload is needed
        if (!performUpload || !artifactorySymbolsURL) {
            return;
        }

        if(!symstoreFound) {
            helpers.error("symstore.exe is not available");
            return;
        }
        // Collect PDBs
        const pdbs = await fileUtils.globFiles([
            path.join(conanCachePath, 'data/**/build/**/*.pdb'),
            'C:/.conan/**/*.pdb'
        ]);

        for(const pdb of pdbs) {
            await addToSymStore(pdb);
        }

        if(pdbs.length > 0) {
            await uploadSymStore();

            const dlls = await fileUtils.globFiles([
                path.join(conanCachePath, 'data/**/build/**/*.dll'),
                'C:/.conan/**/*.dll'
            ]);

            await uploadAllToSentry([...pdbs, ...dlls])
        }
    } else if (process.platform == 'darwin') {
        await splitDepsDebugSymbols('.dylib', splitDsymFile, performUpload);
    } else {
        await splitDepsDebugSymbols('.so*', splitDebugFile, performUpload);
    }
}

async function processDebugInformation(buildDir, buildType, performUpload) {
    if (process.platform == 'win32') {
        const pdbs = await fileUtils.globFiles(path.join(buildDir, `${buildType}/**/*.pdb`));

        if (performUpload) {
            const dlls = await getMatchingFiles(
                path.join(buildDir, `${buildType}/**/*.dll`),
                path.join(buildDir, `${buildType}/**/*.pdb`),
                true
            )

            const exes = await getMatchingFiles(
                path.join(buildDir, `${buildType}/**/*.exe`),
                path.join(buildDir, `${buildType}/**/*.pdb`),
                true
            )

            for(const pdb of pdbs) {
                await addToSymStore(pdb);
            }

            await uploadAllToSentry([...dlls, ...pdbs, ...exes]);
        }
        // Remove PDBs from the distribution directory.
        const miscFiles = await fileUtils.globFiles([
            path.join(buildDir, `${buildType}/**/*.ipdb`),
            path.join(buildDir, `${buildType}/**/*.iobj`),
            path.join(buildDir, `${buildType}/**/*.ilk`),
        ]);

        for (const pdb of [ ...exePdbs, ...miscFiles ]) {
            await fs.promises.rm(pdb);
        }
    } else if (process.platform == 'darwin') {
        await splitAudacityDebugSymbols(buildDir, buildType, '.dylib', splitDsymFile, performUpload);
    } else {
        await splitAudacityDebugSymbols(buildDir, buildType, '.so*', splitDebugFile, performUpload);
    }
}

module.exports = {
    processDependenciesDebugInformation: processDependenciesDebugInformation,
    processDebugInformation: processDebugInformation,
}
