const fs = require('fs')
const temp = require('fs-temp');
const path = require('path');
const DSStore = require('ds-store');

const helpers = require('../lib/helpers.js');
const fileUtils = require('../lib/fileUtils.js');

const backgroundImage = path.join(workspaceDir, 'mac', 'Resources', 'Audacity-DMG-background.png');

async function estimateBundleSize(files) {
    let size = 0;

    for (const file of files) {
        size += (await fs.promises.lstat(file)).size;
    }

    // Allocate more space than needed, to account for block size and filesystem overhead.
    // This does not affect the final DMG size
    return size * 1.5
}

async function createTempImage(appPath, volName, size, finalizers) {
    const tempImagePath = temp.template('%s.dmg').writeFileSync('');
    helpers.log(tempImagePath);

    finalizers.push(async () => {
        if (fs.existsSync(tempImagePath)) {
            helpers.log(`Removing image ${tempImagePath}`);
            await fs.promises.rm(tempImagePath);
        }
    });

    const maxAttempts = 10;

    for (let attempt = 1; attempt < maxAttempts; ++attempt) {
        try {
            await helpers.execWithLog('hdiutil', [
                'create', tempImagePath,
                '-ov',
                '-format', 'UDRW',
                '-fs', 'HFS+',
                '-size', size,
                '-srcdir', path.dirname(appPath),
                '-volname', volName
            ]);

            return tempImagePath;
        } catch (err) {
            helpers.error(err.message);
            await helpers.sleep(2000 * attempt);
        }
    }

    throw new Error(`Failed to create image ${tempImagePath}`);
}

async function detachImage(mountedPath) {
    const maxAttempts = 10;

    for (let attempt = 1; attempt < maxAttempts; ++attempt) {
        try {
            if (!fs.existsSync(mountedPath)) {
                helpers.log(`Image ${mountedPath} already detached`);
                return;
            }

            return await helpers.execWithLog('hdiutil', [
                'detach', mountedPath
            ]);
        } catch (err) {
            helpers.error(err.message);
            await helpers.sleep(2000 * attempt);
        }
    }

    try {
        if (!fs.existsSync(mountedPath)) {
            helpers.log(`Image ${mountedPath} already detached`);
            return;
        }

        return await helpers.execWithLog('hdiutil', [
            'detach', mountedPath, '-force'
        ]);
    } catch (err) {
        helpers.error(err.message);
        throw new Error(`Failed to detach image ${mountedPath}`);
    }
}

async function attachImage(imagePath, finalizers) {
    const maxAttempts = 10;

    for (let attempt = 1; attempt < maxAttempts; ++attempt) {
        try {
            const output = await helpers.getExecOutput('hdiutil', [
                'attach', imagePath,
                '-nobrowse',
                '-noverify',
                '-noautoopen'
            ]);

            const match = /Apple_HFS\s+(.*)\s*$/.exec(output.stdout);
            const mountedPath = match[1];

            finalizers.push(async () => {
                if (fs.existsSync(mountedPath)) {
                    helpers.log(`Detaching image ${imagePath} mounted at ${mountedPath}`);
                    await detachImage(mountedPath);
                }
            });

            return mountedPath;
        } catch (err) {
            helpers.error(err.message);
            await helpers.sleep(2000 * attempt);
        }
    }

    throw new Error(`Failed to attach image ${imagePath}`);
}

async function copyFiles(targetDir, appDir, files) {
    appDir = path.dirname(appDir);

    /*for(const file of files) {
        const relativePath = path.relative(appDir, file);
        const targetPath = path.join(targetDir, relativePath);
        const targetParent = path.dirname(targetPath);

        if (!fs.existsSync(targetParent)) {
            fs.mkdirSync(targetParent, { recursive: true });
        }

        await fs.promises.copyFile(file, targetPath);
    }*/

    const bgDir = path.join(targetDir, '.background');
    const bgPath = path.join(bgDir, 'bg.png');

    if (!fs.existsSync(bgDir)) {
        fs.mkdirSync(bgDir);
    }

    await fs.promises.copyFile(backgroundImage, bgPath);
}

async function createLinks(targetDir) {
    await fs.promises.symlink('/Applications', path.join(targetDir, 'Applications'));
}

async function createDSStore(mountPath, name) {
    const ds = new DSStore();

    ds.vSrn(1);
    ds.setIconSize(72);
    ds.setBackgroundPath(path.join(mountPath, '.background', 'bg.png'));
    ds.setWindowPos(400, 100);
    ds.setWindowSize(600, 450);
    ds.setIconPos(name, 170, 350);
    ds.setIconPos('Applications', 430, 350);

    await new Promise((resolve, rejects) => {
        ds.write(path.join(mountPath, '.DS_Store'), err => {
            if (err) {
                rejects(err);
            } else {
                resolve();
            }
        });
    });
}

async function convertDMG(tempDmgPath, dmgPath) {
    const maxAttempts = 10;

    for (let attempt = 1; attempt < maxAttempts; ++attempt) {
        try {
            if (fs.existsSync(dmgPath)){
                fs.rmSync(dmgPath);
            }

            await helpers.execWithLog('hdiutil', [
                'convert', tempDmgPath,
                '-format', 'UDZO',
                '-imagekey',
                'zlib-level=9',
                '-o', dmgPath
            ]);

            return;
        } catch (err) {
            helpers.error(err.message);
            await helpers.sleep(2000 * attempt);
        }
    }

    if (!fs.existsSync(dmgPath)) {
        throw new Error(`Failed to convert image ${tempDmgPath} to ${dmgPath}`);
    }
}

async function packageDMG(dmgPath, appPath) {
    finalizers = []
    const volname = path.basename(appPath, '.app');

    try {
        const files = await fileUtils.listDirectory(appPath);
        const size = await estimateBundleSize([...files, backgroundImage]);

        const tempImagePath = await createTempImage(appPath, volname, size, finalizers);
        const mountedPath = await attachImage(tempImagePath, finalizers);
        await copyFiles(mountedPath, appPath, files);
        await createLinks(mountedPath);
        await createDSStore(mountedPath, path.basename(appPath));
        await detachImage(mountedPath);
        await convertDMG(tempImagePath, dmgPath);
    } finally {
        Promise.all(finalizers.slice(0).reverse().map(async (finalizer) => finalizer()));
    }
}

module.exports = {
    packageDMG: packageDMG,
}
