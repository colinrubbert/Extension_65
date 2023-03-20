
function prepareTestEnvironment() {
    require('./mockChrome');
    require('./mockChromeExtensionMessageRelay');

    window.IRX = {};
    // TODO: remove irxGlobals alias
    window.irxGlobals = window.IRX;
}

module.exports = prepareTestEnvironment;
