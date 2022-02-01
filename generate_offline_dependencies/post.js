const artifact = require('@actions/artifact');
const helpers = require('../lib/helpers.js');

async function run() {
    const revision = (await helpers.getExecOutput('git', ['show', '-s', '--format=%h'])).stdout.trim();

    const name = `audacity-dependencies-${helpers.getDateString()}+${revision}`;
    const tarball = `${name}.tar.gz`

    await helpers.execWithLog('tar', [ 
        'czf', tarball,
        '-C', workspaceDir,
        '.offline'
    ]);

    const artifactClient = artifact.create();
    await artifactClient.uploadArtifact(name, [ tarball ]);
}

run();
