/* globals IRX, LoggableClass */

((globals) => {
    const AWAIT_TIMEOUT_MS = 1000 * 5; // 5 seconds

    class StoreUtils extends LoggableClass {
        constructor() {
            super(false);
        }

        #keysArr(keys, allowNull=false){
            if(keys===null && allowNull) return null;
            if(!Array.isArray(keys)) keys = [keys];
            return keys;
        }

        onChanged(cb){
            chrome.storage.onChanged.addListener(cb);
        }

        getAll(){
            return this.getMulti(null);
        }

        // wait/block until keys are set/present then return their values!
        getAwaitMulti(keys){
            return new Promise((resolve, reject) => {
                let checkTmo, waitTmo = false;
                waitTmo = setTimeout(() => {
                    clearTimeout(checkTmo);
                    reject('Timeout awaiting for store return.');
                }, AWAIT_TIMEOUT_MS);

                const checkInterval = async () => {
                    const vals = await this.getMulti(keys);
                    for(let key in keys){
                        if(!(key in vals) || !vals[key]){
                            this.log('Missing key in awaitMulti, sleeping!', key);
                            checkTmo = setTimeout(checkInterval, 500);
                            return;
                        }
                    }
                    clearTimeout(waitTmo);
                    clearTimeout(checkTmo);
                    resolve(vals);
                };
            });
        }


        getMulti(keys, store=chrome.storage.local){
            keys = this.#keysArr(keys, true);
            this.log('getting keys', keys);
            return new Promise((resolve, reject) => {
                store.get(keys, (items) => {
                    if (chrome.runtime.lastError) {
                        this.log('Error occurred loading keys', chrome.runtime.lastError);
                        return reject(chrome.runtime.lastError);
                    }
                    this.log('fetched values [keys only]', Object.keys(items));
                    resolve(items);
                });
            });
        }

        getSession(key){
            return new Promise(async (resolve, reject) => {
                try{
                    let vals = await this.getMulti(key, chrome.storage.session);
                    resolve(vals[key]);
                }catch(e){
                    reject(e);
                }
            });
        }

        get(key){
            return new Promise(async (resolve, reject) => {
                try{
                    let vals = await this.getMulti(key);
                    resolve(vals[key]);
                }catch(e){
                    reject(e);
                }
            });
        }

        delete(keys){
            this.log('deleting keys', keys);
            return chrome.storage.local.remove(this.#keysArr(keys));
        }


        // returns a promise
        set(key, val){
            const set = {};
            set[key] = val;
            return this.setMulti(set);
        }

        // returns a promise
        setSession(key, val){
            const set = {};
            set[key] = val;
            return this.setMulti(set, chrome.storage.session);
        }

        // returns a promise
        async setMulti(values, store=chrome.storage.local){
            // values in format {key:val, key:val, ...}
            this.log('setting in setMulti [keys only]', Object.keys(values));
            return new Promise((resolve, reject) => {
                store.set(values,() => {
                    resolve();
                });
            });
        }

    }

    this.storeUtils = new StoreUtils();

})(IRX);
