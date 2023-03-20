const { setupSpiesRecursively } = require('./mock-utils.js');

function createMockChromeExtensionRelay() {
    const RELAY_LEVELS = {
        iframe: 'iframe',
        iframe_shim: 'iframe_shim',
        page: 'page',
        content: 'content',
        extension: 'extension'
    };

    class MockChromeExtensionMessageRelay {
        get levels() { return RELAY_LEVELS; }
        send() {}
        localSend() {}
    }

    function chrome_extension_message_relay(my_relay_namespace, current_level, debug_mode, target_domain) {
        return new MockChromeExtensionMessageRelay(
            my_relay_namespace,
            current_level,
            debug_mode,
            target_domain
        );
    }

    //return setupSpiesRecursively(chrome);
    return chrome_extension_message_relay;
}

global.chrome_extension_message_relay = createMockChromeExtensionRelay();

module.exports = { chrome: global.chrome_extension_message_relay };
