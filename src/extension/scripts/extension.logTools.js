/* globals IRX, LoggableClass */

((globals) => {

    const COMBINED_STORAGE_KEY = '_LOGS';
    const STORAGE_KEY_PREF = 'LOGS';
    const MAX_RETENTION_LOG_ROWS = 10000;
    const LOG_RETAIN_DURATION_MS = 1000 * 60 * '1440';

    class LogTools extends LoggableClass {
        constructor() {
            super(false, false);
        }

        #purgeForLength(logRows){
            return logRows.slice(0, Math.min(MAX_RETENTION_LOG_ROWS, logRows.length));
        }

        #removeOld(logRows){
            let purgeFromTs = (new Date().getTime() - LOG_RETAIN_DURATION_MS);
            let numPurged = 0;
            const filtered = logRows.filter(row => {
                if (row.ts < purgeFromTs) {
                    numPurged++;
                    return false;
                }
                return true;
            });
            this.log(`Purged ${numPurged} old log rows. (of ${logRows.length})`);
            return filtered;
        }

        #sortRows(logRows){
            // sort newest to oldest (so new are preserved if we truncate)
            logRows.sort((a,b) => {
                return b.ts - a.ts;
            });
        }

        async clear(){
            const storeItems = await globals.storeUtils.getAll();
            const logSetKeys = this.#filterToLogSetKeys(storeItems);
            const clearKeys = logSetKeys.concat([COMBINED_STORAGE_KEY]);
            this.log('Clearing all log keys', clearKeys);
            return globals.storeUtils.delete(clearKeys);
        }

        async getAll(){
            await this.combineAndPurge();
            return globals.storeUtils.get(COMBINED_STORAGE_KEY);
        }

        #filterToLogSetKeys(keys){
            if(!Array.isArray(keys)) keys = Object.keys(keys);
            return keys.filter(k => k.startsWith(`${STORAGE_KEY_PREF}_` || k.startsWith('_LOGS_')));
        }

        // returns promise that resolves to an array of all log items
        combineAndPurge(){
            return new Promise(async (resolve) => {
                this.log('Running combine & purge.');
                // get everything from storage and coalesce all the log stuff
                const storeItems = await globals.storeUtils.getAll();
                const logSetKeys = this.#filterToLogSetKeys(storeItems);

                this.log('Storage keys for logs', logSetKeys);
                if(logSetKeys.length) await globals.storeUtils.delete(logSetKeys);

                let prevCombinedRows = (storeItems[COMBINED_STORAGE_KEY] || '');
                let logRows = prevCombinedRows;
                logSetKeys.forEach(key => { logRows += '\n' + storeItems[key]; });

                // TODO -- do we need to do this now???
                let logRowsArr = logRows.split('\n').filter(v => v !== '').map(row => JSON.parse(row));

                logRowsArr = this.#removeOld(logRowsArr);
                logRowsArr = this.#purgeForLength(logRowsArr);
                this.#sortRows(logRowsArr);

                if (!logRowsArr.length) {
                    return this.log('Combine not writing anything, no rows to write.');
                }

                await globals.storeUtils.set(COMBINED_STORAGE_KEY, logRowsArr.map(row => JSON.stringify(row)).join('\n'));
                this.log(`Adding ${logSetKeys.length} sets, ${logRowsArr.length} total rows (${prevCombinedRows.split('\n').length} previously).`);
                resolve(logRowsArr);
            });
        }

        async getSize(readable = true){
            const storeItems = await globals.storeUtils.getAll();
            const logSetKeys = this.#filterToLogSetKeys(storeItems);
            let combined = await chrome.storage.local.getBytesInUse(COMBINED_STORAGE_KEY);
            let toWrite = await chrome.storage.local.getBytesInUse(logSetKeys);
            const b = combined + toWrite;

            const k = b > 0 ? Math.floor((Math.log2(b)/10)) : 0;
            const rank = (k > 0 ? 'KMGT'[k - 1] : '') + 'b';
            const count = Math.floor(b / Math.pow(1024, k));
            return readable ? `${count} ${rank}` : b;
        }

        // Format row or logs as readable text
        #readbleRows(logRows) {
            return logRows.map(row => {
                return `${row.ts_readable} : ${row.context} [${row.process}] >>> ${JSON.stringify(row.data)}`;
            }).join('\n');
        }

        getLogsDataUri(){
            return new Promise(async (resolve) => {
                let logRows = await this.combineAndPurge();
                //format the logs for readability
                let textB64 = btoa(this.#readbleRows(logRows));
                resolve('data:text/plain;base64,' + textB64);
            });
        }

        getLogs(asText = false){
            return new Promise(async (resolve) => {
                let logRows = await this.combineAndPurge();
                if (asText) logRows = this.#readbleRows(logRows);
                resolve(logRows);
            });
        }
    }

    globals.LOG_TOOLS = new LogTools();
})(IRX);
