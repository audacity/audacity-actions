const core = require('@actions/core');

module.exports = {
    Alpha : 0,
    Beta : 1,
    Release : 2,

    getBuildLevel: () => {
        const buildLevel = core.getInput('build_level');

        if (buildLevel === 'beta') {
            return 1;
        } else if (buildLevel === 'release') {
            return 2;
        } else {
            return 0;
        }
    },

    getBuildSuffix: (level) => {
        if (level == 1) {
            return 'beta';
        } else if (level == 2) {
            return '';
        } else {
            return 'alpha';
        }
    },
}
