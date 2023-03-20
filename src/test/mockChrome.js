const { setupSpiesRecursively } = require('./mock-utils.js');
const manifest = require('../../manifest.json');

function createMockChrome() {
    const chrome = {
        action: {
            setBadgeBackgroundColor() { return Promise.resolve(); },
            setBadgeTextColor() { return Promise.resolve(); },
            setBadgeText() { return Promise.resolve(); },
        },
        alarms: {
            onAlarm: {
                addListener() {}
            },
            create() {}
        },
        runtime: {
            connect() {},
            getManifest (){
                return manifest;
            },
            onConnect: {
                addListener() {}
            },
            onInstalled:{
                addListener() {}
            },
            onMessageExternal: {
                addListener() {}
            },
            reload() {},
        },
        storage: {
            local: {
                get() {},
                getBytesInUse() {},
                set() {},
            }
        },
        tabs: {
            get() {},
            getCurrent() {},
            query() {},
        },
    };

    return setupSpiesRecursively(chrome);
}

global.chrome = createMockChrome();

module.exports = { chrome: global.chrome };
