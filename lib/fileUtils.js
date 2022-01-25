const fs = require('fs');
const path = require('path');

const glob = require('@actions/glob');

helpers = require('../lib/helpers.js')

const getFilesFromDirectoryRecursive = async (directoryPath) => {
    const filesInDirectory = await fs.promises.readdir(directoryPath);
    const files = await Promise.all(
        filesInDirectory.map(async (file) => {
            const filePath = path.join(directoryPath, file);
            const stats = await fs.promises.stat(filePath);

            if (stats.isDirectory()) {
                return getFilesFromDirectoryRecursive(filePath);
            } else {
                return filePath;
            }
        })
    );

    return files.filter((file) => file.length); // return with empty arrays removed
};

async function globFiles(patterns) {
    const globber = await glob.create(
        Array.isArray(patterns) ?
            patterns.join('\n') :
            patterns
    );

    let files = [];

    for await (const file of globber.globGenerator()) {
        const stat = await fs.promises.lstat(file);

        if (stat.isSymbolicLink()) {
            continue;
        }

        files.push(file);
    }

    return files;
}

async function listMacosAppsRecursive(dir, apps) {
    const dirContents = await fs.promises.readdir(dir);

    await Promise.all(
        dirContents.map(async (file) => {
            const filePath = path.join(dir, file);
            const stats = await fs.promises.stat(filePath);

            if (stats.isDirectory()) {
                if (path.extname(file) == '.app') {
                    apps.push(filePath);
                } else {
                    return listMacosAppsRecursive(filePath, apps);
                }
            }
        })
    );
}

async function getAudacityMacOSBundleFiles(appPath) {
    bundle = {
        MacOS: [],
        Frameworks: {
            dylib: []
        },
        modules: [],
        misc: []
    }

    const files = (await getFilesFromDirectoryRecursive(appPath)).flat(Infinity);
    files.forEach(path => {
        if(path.indexOf('Contents/MacOS') != -1) {
            bundle.MacOS.push(path);
        } else if (path.indexOf('Contents/Frameworks') != -1) {
            const stat = fs.statSync(path);
            if (stat.isSymbolicLink()) {
                bundle.misc.push(path);
            } else if (stat.isFile()) {
                bundle.Frameworks.dylib.push(path);
            } else {
                throw Error('Bundled frameworks are not supported');
            }
        } else if (path.indexOf('Contents/modules') != -1) {
            bundle.modules.push(path);
        } else {
            bundle.misc.push(path);
        }
    });
    
    return bundle;
}

async function copyFile(source, dest) {
    const parentPath = path.dirname(dest);

    if (!fs.existsSync(parentPath)) {
        fs.mkdirSync(parentPath, { recursive: true });
    }

    return fs.promises.copyFile(source, dest);    
}

async function copyFiles(base, files, dest) {
    return helpers.awaitAll(files, async (file) => {
        const relative = path.relative(base, file);
        return copyFile(file, path.join(dest, relative));
    });
}

async function listMacosApps(dir) {
    apps = []
    await listMacosAppsRecursive(dir, apps);
    return apps;
}

module.exports = {
    listDirectory: async (directoryPath) => {
        return (await getFilesFromDirectoryRecursive(directoryPath)).flat(Infinity);
    },
    globFiles: globFiles,
    listMacosApps: listMacosApps,
    getAudacityMacOSBundleFiles,
    copyFile: copyFile,
    copyFiles: copyFiles,
};
