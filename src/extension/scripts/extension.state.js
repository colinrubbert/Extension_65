/* globals IRX, StateBaseClass */
// This is used specifically to get/manage/handle state in any extension loaded page (i.e. chrome-extension://)

((globals) => {
    const STORE = globals.STORE;
    const RELAY = globals.RELAY;
    const REMOTE_URL = 'https://irx-extension-files-prod.irx.indeed.com/';
    const USE_REMOTE = 'true' === 'true';

    class ExtensionState extends StateBaseClass {
        #assertUser;
        #needsUpdate = false;
        #ready = false;

        constructor(assertUser = false, version=null) {
            super(false, 'EXT STATE');

            if(version) this._version = version;
            this.#assertUser = assertUser;

            RELAY.on('changeEnv.state', (data) => this.#setEnv(data.env));

            RELAY.on('markRemindersSeen.state', async (data) => {
                await this.markReminderSeen(data.reminders);
            });

            if(globals.IS_DEV){
                globals.RELAY.on('liveReload.state', () => {
                    console.error('IRX Extension Reload Triggered');
                    chrome.runtime.reload();
                });
            }
        }

        async markReminderSeen(reminderKeys){
            if(!Array.isArray(reminderKeys)) reminderKeys = [reminderKeys];
            let reminders = await STORE.get('reminders') || {};
            reminderKeys.forEach(key => reminders[key] = true);
            await STORE.set('reminders', reminders);
            this._reminders = reminders;
        }

        async #setEnv(env){
            if(!this.availbleEnvironments.includes(env)){
                return console.error('Attempted to change to non-existing environment', env);
            }

            await STORE.delete(this._USER_STATE_KEYS);
            await STORE.set('env', env);
            chrome.runtime.reload();
        }

        async #triggerStateUpdated(){
            const targetLevels = [RELAY.levels.content, RELAY.levels.iframe];
            let userInfo = Object.assign({}, this.userInfo);
            userInfo.reminders = await STORE.get('reminders') || {}; // make sure to grab newest reminders
            RELAY.send('updated.state', targetLevels, userInfo);
        }

        #logoutUser(){
            this._USER_STATE_KEYS.forEach(key => this[`_${key}`] = null);
            this.logNoStore('Triggering state update from store updated, user logged out');
            this.#triggerStateUpdated();
        }

        // callback for when the local store has been updated -- see if we need to do anything!
        async #storeUpdated(changes){

            if('irxNeedsUpdate' in changes && changes.irxNeedsUpdate){
                this.log('Update needed, logging out user!');
                this.#needsUpdate = true;
                return this.#logoutUser();
            }

            // list of changes for userInfo
            let userInfoChanged = this._USER_STATE_KEYS.filter(key => key in changes);

            if(userInfoChanged.length){
                this.log('User info changed!', userInfoChanged);
                userInfoChanged.forEach(key => {
                    this[`_${key}`] = changes[key];
                });

                this.#triggerStateUpdated();
            }

            // if anything related to logging settings have been changed, update the logger
            if('LOGGER' in globals){
                if('log_stream' in changes) globals.LOGGER.enableStream(!!changes.log_stream);
                if('log_suppression' in changes) globals.LOGGER.enableSuppressed(!!changes.log_suppression);
            }
        }

        async updatePreferences(preferences){
            // individual pages (service worker, content scripts, etc) will get auto-updated from store change listeners

            const currentPrefs = this.preferences;

            // This is safety logic here to handle how prefs are stored -- so full "old" categorized values can
            // be passed in, or just top-level key values
            const newPreferences = this._formatPreferences(preferences);

            // make sure to keep any missing keys from currentPrefs as sanity protection
            Object.keys(currentPrefs).forEach(key => {
                if(!(key in newPreferences)) newPreferences[key] = currentPrefs[key];
            });
            this.log('Setting new preferences', newPreferences);

            this._preferences = newPreferences;
            await STORE.set('preferences', newPreferences);
        }

        // get a URL from the remote/currently deployed version for this major version!
        getRemoteUrl(url){
            if(!USE_REMOTE){
                return globals.UTILS.extensionUrl(url);
            }
            return `${REMOTE_URL}${this.version}/${url}`;
        }

        // function that can be used to validate the store is ready, check login, etc
        // returns a promise
        init() {
            return new Promise(async (resolve, reject) => {
                this.log('Initializing');
                if (this.#ready) return resolve();

                // wait for store to be initialized
                await STORE.init();
                this.log('Store ready');
                this.#needsUpdate = STORE.get('irxNeedsUpdate');
                if(this.#needsUpdate){
                    this.log('Needs version update!');
                    return reject(new globals.ExtensionVersionError('Extension update needed!'));
                }

                STORE.registerChangeListener(this.#storeUpdated.bind(this));
                this._env = STORE.get('env');
                if(!this._version) this._version = STORE.get('version');

                if (this.#assertUser){
                    // BLOCK until assertUser is done!
                    try{
                        await this.constructor.awaitUserAsserted();
                    }catch(e){
                        console.error(e);
                        this.log(e);
                        return reject();
                    }
                }

                // Hydrate data from the store initially
                this.allUserKeys.filter(STORE.isKey).forEach(key => {
                    this[`_${key}`] = STORE.get(key);
                });

                this.log('info initial', this.info);
                this.#triggerStateUpdated();
                this.#ready = true;
                resolve();
            });
        }
    }

    globals.ExtensionState = ExtensionState;

})(IRX);
