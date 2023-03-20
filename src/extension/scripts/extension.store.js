/* globals IRX, LoggableClass */

/*
This is the interface for chrome storage that can be used in an extension page or a content script.
It requires a preload that can be done asynchronously, and is set to update when anything in the underlying
store is updated. You can also register a listener for when it changes

To use just make sure you're in an async function and:
await STORE.init();
then you can access the public interfaces for fetching/setting data
 */

((globals) => {
    // TO KEEP: integrations, indeed_account_id, first_installed_version, proctor_group_assignments
    // linked_indeed_account, seen_interview_getting_started, seen_popup_interview_getting_started

    // all keys to save/used must be whitelisted
    const KEYS = [
        'env', 'version', 'clientId', // generic setting values
        'irxUserUuid', 'advertiserKey', 'advertisers', 'proctorGroups', 'integrations', 'preferences', // STATE values,
        'reminders', // installation specific values
        'lastAuthCookieHash', 'userAsserted', 'irxNeedsUpdate'
    ];

    const DEFAULTS = Object.freeze({
        env: 'production',
        userAsserted: false
    });
    
    class Store extends LoggableClass {
        #cache = {};
        #ready = false;
        #changeListeners = [];
        
        constructor(){
            super(false);
            globals.storeUtils.onChanged(this.#storeUpdated.bind(this));
        }

        isKey(key){
            return KEYS.includes(key);
        }

        registerChangeListener(cb){
            this.#changeListeners.push(cb);
        }

        #storeUpdated(changes, namespace){
            // delete any changes that aren't part of the store functionality (like LOGS)
            for(let key in changes){
                if(!KEYS.includes(key)){
                    delete changes[key];
                }else {
                    // throwing out newVal and oldValue and just setting the value to newVal for simplicity
                    // we may need to restore this functionality in the future if we need it
                    changes[key] = changes[key].newValue;
                }
            }

            if(!Object.keys(changes).length) return;
            this.log('Store changed', changes);
            this.#changeListeners.forEach(fn => fn(changes));
        }

        async init(){
            return globals.storeUtils.getMulti(KEYS).then(items => {
                // Copy the data retrieved from storage into storageCache.
                this.log('Initial load complete, keys included:', Object.keys(items));
                Object.assign(this.#cache, items);
                for(let key in DEFAULTS){
                    if(!(key in this.#cache)) this.#cache[key] = DEFAULTS[key];
                }
                this.logNoStore('Store ready, preloaded', this.#cache);
                this.#ready = true;
            });
        }

        delete(keys){
            return globals.storeUtils.delete(keys);
        }

        get(key){
            if(!this.#ready){
                throw new Error(('Cannot request store values, not yet initialized!'));
            }
            if(!KEYS.includes(key)){
                throw new Error(`Key "${key}" is not whitelisted in KEYS`);
            }
            return this.#cache[key];
        }

        // returns a promise
        set(key, val){
            const set = {};
            set[key] = val;
            return this.setMulti(set);
        }

        // returns a promise
        setMulti(values){
            // values in format {key:val, key:val, ...}
            Object.assign(this.#cache, values);
            return globals.storeUtils.setMulti(values);
        }
    }

    this.STORE = this.STORE || new Store();

})(IRX);
