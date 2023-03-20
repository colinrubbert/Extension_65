/* globals IRX, StateBaseClass */

((globals) => {

    const RELAY = globals.RELAY;

    class ContentState extends StateBaseClass {
        #initCb = null;
        #ready = false;
        #bridgeIframe;
        #userChangeCallbacks = [];
        #manifestDependencies;

        constructor(){
            super(false, 'STATE (CONTENT)');

            RELAY.on('updated.state', this.#stateUpdated.bind(this));
            RELAY.on('markReminderSeen.state', (data) => this.markReminderSeen(data.keys) );

            globals.CONTENT_UTILS.onOrphaned(() => {
                this.#bridgeIframe = null;
                globals.FrameBridge.destroyBridgeIframe();
            });
        }

        #stateUpdated(userInfo){
            if(globals.CONTENT_UTILS.isOrphaned) return;

            this.logNoStore('_stateUpdated', userInfo);
            userInfo = globals.UTILS.sortObjectByKeysAlpha(userInfo);
            this.log('loginState ' + this.#ready ? 'updated' : 'ready', userInfo);

            let loginChanged = !this.loggedIn && userInfo.irxUserUuid || this.loggedIn && !userInfo.irxUserUuid;

            this.log('Login changed?', loginChanged, 'Logged in?', this.loggedIn);
            const userInfoChanged = JSON.stringify(this.userInfo) !== JSON.stringify(userInfo);

            this.allUserKeys.forEach(key => {
                this[`_${key}`] = userInfo[key];
            });

            if(!this.#ready) {
                this.#ready = true;
                if(this.#initCb) this.#initCb();
                return;
            }

            if(!userInfoChanged) return this.log('No actual change in userInfo');

            if(!this.loggedIn) globals.UI.close();

            this.#userChangeCallbacks.forEach(cb => {
                cb(this.loggedIn, this.userInfo);
            });
        }

        // validate that state is ready (iframe loaded and ready), returns a promise
        setup(){
            return new Promise(async (resolve, reject) => {
                if(this.#ready) return resolve();
                this.#initCb = resolve;

                // build the page bridge/iframe to extension shim page
                let url = globals.UTILS.extensionUrl(`src/extension/extension.irx.html`);
                try {
                    this._version = await this.constructor.awaitRemoteVersion();
                }catch(e){
                    console.error(e);
                    this.log('An error occurred fetching version!', e.toString());
                    return reject(e);
                }
                this._env = await globals.storeUtils.get('env') || 'production';

                this.log('Create frame bridge at url', url, this.env, this.version);

                this.#bridgeIframe = await globals.FrameBridge.createBridgeIframe(url, this.env,
                    '*', null, this.version);
            });
        }

        // register a callback w/ signature (loggedIn, userInfo) => {}
        // Called whenever a user is logged in / logged out / proctor changes / etc
        onUserChange(cb){
            this.#userChangeCallbacks.push(cb);
            if(this.loggedIn){
                cb(true, this.userInfo);
            }
        }

        // mark a reminder as seen (so it doesn't trigger again)
        markReminderSeen(reminderKeys){
            if(globals.CONTENT_UTILS.isOrphaned) return;

            if(!Array.isArray(reminderKeys)) reminderKeys = [reminderKeys];
            this.log('Mark reminders seen', reminderKeys);
            reminderKeys.forEach(k => this.reminders[k] = true);
            RELAY.send('markRemindersSeen.state', RELAY.levels.iframe_shim, {reminders: reminderKeys});
        }
    }

    globals.ContentState = ContentState;
})(IRX);
