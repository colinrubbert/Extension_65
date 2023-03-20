/* globals IRX */

((globals) => {
    let _debug = false;
    let _relayDebug = false;/*@DEBUG.content_relay*/
    const RELAY = globals.RELAY || globals.chrome_extension_message_relay('IRX', 'content', _relayDebug);
    globals.IS_DEV = false;

    globals.LOGGER = window.LOGGER || (() => {

        let stateReady = false;
        let pendingLogMessages = []; // items not logged until the STATE iframe is ready

        function _push(process, data, context = 'content') {
            const logData = {
                context,
                process: process,
                data
            };
            if(!stateReady) return pendingLogMessages.push(logData);
            _log(logData);
        }

        function _log(logData){
            if(globals.CONTENT_UTILS.isOrphaned) return;
            if(!Array.isArray(logData)) logData = [logData];
            RELAY.send('write.logs', RELAY.levels.iframe_shim, {logs: logData});
        }

        RELAY.on('updated.state', () => {
            stateReady = true;
            _log(pendingLogMessages);
            pendingLogMessages = null;
        });

        /*
        // listener from page scripts
        // OUTDATED, REMOVE PROLLY
        RELAY.on('LOG:from_page', (msg) => {
            delete msg.msg_id;
            if (IS_DEV || _page_debug) console.log('::ZAPINFO PAGE@' + msg.process, msg.data);
            _push(msg.process, msg.data, 'page');
        });
        */

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
            level: 'content'
        };
    })();

    globals.RELAY = RELAY;
})(IRX);
