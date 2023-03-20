/* globals IRX */

// push logs to logger in format:
// LOGGER.log('process', data (string or json-erializable object))

// TODO -- document how this works!!!

((globals) => {

    const relayDebug = false;
    const isServiceWorker = IRX.toString().includes('ServiceWorkerGlobalScope');
    const isStandaloneWindow = isServiceWorker ? false : window.self === window.top;
    const relayLevel = isServiceWorker ? 'service_worker' : (isStandaloneWindow ? 'page' : 'iframe_shim');

    globals.RELAY = globals.RELAY || globals.chrome_extension_message_relay('IRX', relayLevel, relayDebug);
    globals.IS_DEV = false;

    let frameId;    // Frame ID is used to group/coalesce logs together in the same window load instance
    let curLogSet = 0;

    let QUEUE_WRITE_INTERVAL_TS = 1000 * 10; // 10 seconds interval for persisting logs to store
    if(isServiceWorker) QUEUE_WRITE_INTERVAL_TS = 1000 * 5; // do every 5 seconds if service worker

    let MAX_ROWS_PER_SET = 1000; // # of rows to have max per logSet, to keep speed/memory down
    // overwrite with production values in build
     QUEUE_WRITE_INTERVAL_TS = 1000 *  60 ; // write to logs every 1 min from local memory

    const LOGGER_DEBUG = false;

    const STORAGE_KEY_PREF = 'LOGS';
    const CONTEXTS = Object.freeze({
        core: 'core',
        extension: 'extension',
        content: 'content',
        serviceWorker: 'serviceWorker',
        page: 'page'
    });

    let _pendingWriteRows = [];

    function _console() {
        if (!LOGGER_DEBUG) return;
        console.log('::LOG::', ...arguments);
    }

    globals.RELAY.on('write.logs', data => {
        data.logs.filter(e => e).forEach(entry => _log(CONTEXTS[entry.context], entry.process, ...entry.data));
    });

    // TODO -- still used?
    globals.RELAY.on('writeOut.logs', () => {
        _log(CONTEXTS.content, 'LOGGER', 'Writeout on page unload.');
        _writePendingLogSets(true);
    });

    const logSetStorageId = () => {
        return `${STORAGE_KEY_PREF}_${frameId}_${curLogSet}`;
    };

    // main logging function
    function _log(context, process, ...data) {
        for(let elem of data){
            if(elem instanceof Error) {
                if (globals.IS_DEV) console.error(elem);
                elem = elem.toString();
            }
        }

        let now = new Date(),
            nowReadable = now.toString().split(' (')[0];
        let row = {
            context,
            process: process + (frameId ? `@${frameId}` : ''),
            ts: now.getTime(),
            ts_readable: nowReadable,
            data: data
        };

        _pendingWriteRows.push(JSON.stringify(row));
    }

    // get all logs as rows (returns promise)
    async function _getCurrentLogSet(){
        return new Promise(async (resolve) => {
            chrome.storage.local.get(logSetStorageId(), (data) => {
                let rows = (data[logSetStorageId()] || '').split('\n').filter(v => v);
                resolve(rows);
            });
        });
    }

    // Persist the pending logs to the storage queue
    async function _writePendingLogSets(forceNewSet=false) {
        return new Promise(async (resolve, reject) => {
            if (!_pendingWriteRows.length) return resolve('No writes needed');

            let logRows = await _getCurrentLogSet();
            let toWriteRows = _pendingWriteRows.slice();
            let writeCnt = toWriteRows.length;
            _pendingWriteRows = [];


            let allowedRowsInCurrent = forceNewSet ? 0 : (MAX_ROWS_PER_SET - logRows.length);
            const batchStartInd = allowedRowsInCurrent > 0 ? 0 : 1;
            const batches = Math.ceil((writeCnt-allowedRowsInCurrent)/MAX_ROWS_PER_SET) + (batchStartInd===1 ? 0 : 1);

            for(let i=batchStartInd; i<batches; i++){
                // NOTE this should most likely NOT happen where there's so many logs it batches across more
                // than 2 sets, but just implementing logic to handle just in case
                let rowsBatch;
                if(i > 0){
                    // move onto writing to the next set for this frameID
                    curLogSet++;
                    rowsBatch = toWriteRows.splice(0, Math.min(toWriteRows.length, MAX_ROWS_PER_SET));
                    _console(`Moving to next log set (${curLogSet}). ${rowsBatch.length} rows.`);
                }else{
                    rowsBatch = logRows.concat(
                        toWriteRows.splice(0, MAX_ROWS_PER_SET - logRows.length)
                    );
                    _console(`Set not full, writing to current set. ${rowsBatch.length} rows.`);
                }
                let write = {};
                write[logSetStorageId()] = rowsBatch.join('\n');
                chrome.storage.local.set(write);
            }

            resolve(`Wrote ${writeCnt} to ${batches} batches.`);
        });
    }

    let checkIntervalTmo;
    checkIntervalTmo = setInterval(async () => {
        if(!frameId) return; // don't start writing logs until frameID is set
        let disconnected = false;
        try{
            if(!chrome.runtime.id) disconnected = true;
        }catch(e){
            disconnected = true;
        }
        if(disconnected){
            // extension has been invalidated!
            clearInterval(checkIntervalTmo);
            return;
        }

        try {
            let results = await _writePendingLogSets();
            _console(results);
        } catch (e) {
            console.error('ERROR writing logs', e);
        }
    }, QUEUE_WRITE_INTERVAL_TS);

    // Log errors
    if(!isServiceWorker) {
        // TODO -- alternative for global error catching in service worker?
        globals.addEventListener('error', (e) => {
            _log(CONTEXTS.extension, 'ERROR', {error: e.error.message, filename: e.filename, stack: e.error.stack});
            console.error(e);
        });
    }

    const curLevel = isServiceWorker ? CONTEXTS.serviceWorker : CONTEXTS.extension;

    globals.LOGGER = {
        _debug: {
            _getCurrentLogSet: _getCurrentLogSet
        },
        setFrameId: (id) => {
            frameId = id;
        },
        log: (...args) => {
            _log(curLevel, ...args);
        },
        level: curLevel
    };

    IRX.writeoutPendingLogs = async () => {
        await _writePendingLogSets(true);
    };

    addEventListener('beforeunload', (event) => {
        globals.LOGGER.log('Writing events on page unload');
        _writePendingLogSets(true);
    });

})(IRX);
