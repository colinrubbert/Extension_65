'use strict';
/* globals IRX */

((globals) => {
    let _debug = false;
    let _relayDebug = false;/*@DEBUG.page_relay*/

    const RELAY = globals.RELAY || globals.chrome_extension_message_relay('IRX', 'page', _relayDebug);
    globals.IS_DEV = false;

    globals.LOGGER = window.LOGGER || (() => {

        function _push(process, data, context = 'core') {
            const logData = {
                context,
                process,
                data
            };
            _log(logData);
        }

        function _log(logData){
            if(!Array.isArray(logData)) logData = [logData];
            RELAY.send('write.logs', RELAY.levels.iframe_shim, {logs: logData});
        }

        return {
            log: (process, ...data) => {
                for(let elem of data){
                    if(elem instanceof Error) {
                        if (globals.IS_DEV) console.error(elem);
                        elem = elem.toString();
                    }
                }

                if (globals.IS_DEV && _debug) console.log(`%cZI: [${process}]`, 'font-weight:bold; color: #1e46dc', ...data);
                _push(process, data);
            },
            level: 'page'
        };
    })();

    globals.RELAY = RELAY;
})(IRX);
