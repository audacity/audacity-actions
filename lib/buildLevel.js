const core = require('@actions/core');

module.exports = {
    Alpha : 0,
    Beta : 1,
    Release : 2,

    getBuildLevel: () => {
        const buildLevelInput = core.getInput('build_level');
        const buildLevel = buildLevelInput.length > 0 ?
            buildLevelInput :
            process.env['AUDACITY_BUILD_LEVEL'];

        if (buildLevel === 'beta') {
            return 1;
        } else if (buildLevel === 'release') {
            return 2;
        } else {
            const numericLevel = Number(buildLevel);

            if (Number.isInteger(numericLevel) &&
                numericLevel >= 0 &&
                numericLevel <= 2) {
                return numericLevel;
            }

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
