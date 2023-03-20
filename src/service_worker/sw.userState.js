/* globals IRX, StateBaseClass, ServiceWorkerBaseClass */

((globals) => {

    const USER_INFO_REFETCH_ALARM_MINS = 30; // refetch user info every 30 mins
    const STORE = globals.STORE;

    // Since there's no easy way to do multiple inheritence/mixins in ES6, this worker class is just
    // created on construction of the actual UserState class. A better solution in the future would be
    // some kind of MultiClassMixin function for extensions based on their prototypes
    // (i.e. UserState extends MultiClassMixin(ServiceWorkerBaseClass, StateBaseClass))
    class UserStateWorker extends ServiceWorkerBaseClass{
        #updateUserFn;

        constructor(updateUserFn) {
            super(false);
            this.#updateUserFn = updateUserFn;
        }

        registerAlarms(){
            this._addAlarm(this._updateUser, USER_INFO_REFETCH_ALARM_MINS);
        }

        _updateUser(){
            this.log('Update user called from alarm!');
            this.#updateUserFn();
        }
    }

    class UserState extends StateBaseClass {
        #loginCallbacks = [];
        #userStateWorker;
        #ready = false;

        constructor() {
            super(false, 'SW_USER_STATE');

            // Watch for auth cookie changes
            globals.authCookies.registerChangeListener(async () => {
                this.log('Auth cookie change listener called.');
                this.logNoStore(await globals.authCookies.getCookieValuesKeyed());
                await this.assertUser();
            });

            this.#userStateWorker = new UserStateWorker(() => {
                this.assertUser(true);
            });
        }

        onLoginCallback(fn){
            this.#loginCallbacks.push(fn);
        }

        async assertUser(forceRefresh=false){
            if(!navigator.onLine) return this.log('Not running assertUser, offline.');

            const authCookieCacheKey = 'lastAuthCookieHash';

            await this.#assertReady();
            const updateNeeded = STORE.get('irxNeedsUpdate');

            const authCookiesPresent = await globals.authCookies.areRequiredAuthCookiesSet();
            this.log('Auth cookies present?', authCookiesPresent);
            const lastAuthCookieHash = await STORE.get(authCookieCacheKey);

            if(!authCookiesPresent || updateNeeded) {
                this.log('No auth cookies or update needed, user is not logged in');
                await this.#updateUserInfo(null);
                await STORE.delete(authCookieCacheKey);
                return await STORE.set('userAsserted', true);
            }

            const authCookieHash = await globals.authCookies.getAuthCookieHash();
            this.logNoStore('Compare hash (old vs new)', lastAuthCookieHash, authCookieHash);
            const authCookieChanged = lastAuthCookieHash !== authCookieHash;
            this.log('Auth cookie changed?', authCookieChanged);

            if(authCookieChanged && STORE.get('userAsserted')){
                // user has been asserted but cookies have changed
                // mark user as notAsserted until user is updated so any loading UIs (popup, page, etc) block
                // until we have newest user info
                await STORE.set('userAsserted', false);
            }

            if (this.loggedIn && lastAuthCookieHash) {
                if(!authCookieChanged && !forceRefresh){
                    this.log('Auth cookies have not changed, so assuming login is still valid -- no need to check');
                    // we are making the assumption that login info would never have been stored if user was not asserted before
                    await STORE.set('userAsserted', true);
                    return;
                }
                if(!forceRefresh) this.log('User logged in, but auth cookies have changed -- do passthrough call.');
                if(forceRefresh) this.log('User logged but forceRefresh called -- do passthrough call.');
            }

            // at this point either auth cookies have changed OR user has cookies but login info hasn't been fetched
            // or the data we're storing locally is outdated

            const userInfo = await this.#passthroughLoginUserInfo();
            this.logNoStore('passthroughLogin userInfo', userInfo);
            await this.#updateUserInfo(userInfo);
            await STORE.set(authCookieCacheKey, authCookieHash);

            this.#loginCallbacks.forEach(fn => fn());
        }

        async #passthroughLoginUserInfo(){
            this.log('Checking user login & asserting user exists.');
            let userData;
            let api = await globals.Api.getApi(this.constructor, this._env);
            try {
                userData = (await api.call('/api/auth/passthrough', 'POST'));
                this.logNoStore('userData back', userData);
            } catch (e) {
                // an error with the API request or the user is not logged in
                if (e && globals.IS_DEV) console.error('Error with login check', e);
                this.log('User NOT logged in');
                return null;
            }

            this.logNoStore('User logged in!', userData);

            const user = userData.user;
            const extensionUser = userData.extension_user;

            return {
                irxUserUuid: user.uuid,
                advertisers: user.linked_indeed_account.employers.map(emp => {
                    // because advertiser KEY is called ID in userPresenter from rails
                    return {key: emp.id, name: emp.name};
                }),
                integrations: extensionUser.integrations.map(int => {
                    // remove a TON of not needed stuff in here to keep data model light
                    return {
                        active: int.active,
                        type: int.type,
                        label: int.label,
                        id: int.id,
                        name: int.name
                    };
                }),
                advertiserKey: user.linked_indeed_account.current_employer,
                proctorGroups: this.#formatProctorGroups(userData.proctor_groups),
                preferences: this._formatPreferences(user.options)
            };
        }

        async #updateUserInfo(userInfo){
            let lifecycleEvents = [];
            if(!userInfo) userInfo = {};
            this.logNoStore('#updateUserInfo', userInfo);

            const userInfoChanged = JSON.stringify(this.userInfo) !== JSON.stringify(userInfo);
            if(!userInfoChanged){
                return this.log('No actual change in userInfo.');
            }

            if(!('irxUserUuid' in userInfo)){
                if(this.loggedIn) lifecycleEvents.push('extension_unauthenticated');
                lifecycleEvents.push('extension_user_data_changed_logged_out');
                STORE.delete(this._USER_STATE_KEYS);
                for(let key of this._USER_STATE_KEYS) this[`_${key}`] = null;
                await globals.extensionUtils.setAlertBadge();
            }else{
                if(!this.loggedIn) lifecycleEvents.push('extension_authenticated');
                lifecycleEvents.push('extension_user_data_changed_logged_in');
                for(let key in userInfo){
                    if(this._USER_STATE_KEYS.includes(key)){
                        this[`_${key}`] = userInfo[key];
                    }
                }

                this.log('Setting updated userInfo in store!');
                await STORE.setMulti(userInfo);
                await globals.extensionUtils.clearBadgeText();
            }
            await STORE.set('userAsserted', true);

            for(const event of lifecycleEvents){
                await this.lifecycleEvent(event);
            }
        }

        async #storeUpdated(changes){
            // The only concern we currently have here is preferences.
            // Anything else that might be saved in the store that's relevant is being done so here in the
            // service worker already

            if('preferences' in changes){
                this._preferences = changes.preferences;
            }
        }

        async #assertReady(){
            await STORE.init();
            STORE.registerChangeListener(this.#storeUpdated.bind(this));

            this.log('Store ready');
            this._env = STORE.get('env');
            // Hydrate what we can from the store initially
            this.allUserKeys.filter(STORE.isKey).forEach(key => {
                this[`_${key}`] = STORE.get(key);
            });
            this.logNoStore('info initial', this.info);
        }

        // Pull updated proctor group membership for the user
        async updateProctorAssignments(){
            if(!this.loggedIn) return;
            await this.#assertReady();

            this.log('Updating proctor group assignments.');
            let api = await globals.Api.getApi(this.constructor, this._env);
            let proctorGroups;
            try {
                proctorGroups = this.#formatProctorGroups(await api.call('/api/proctor/listbuckets'));
                this.logNoStore('proctor data back', proctorGroups);
            } catch (e) {
                // an error with the API request or the user is not logged in
                if (e) console.error('Error with proctor fetch check', e);
                return this.log('Error pulling proctor memberships', e);
            }
            // see if they changed -- note both objects are sorted by keys alpha
            if(JSON.stringify(this.userInfo.proctorGroups) === JSON.stringify(proctorGroups)){
                return this.log('Proctor assignments have not changed.');
            }
            this.log('Proctor groups changed, updating in store!');
            this._proctorGroups = proctorGroups;
            STORE.set('proctorGroups', proctorGroups);
        }

        // Trim down proctor info to base details + alpha sort
        #formatProctorGroups(proctorGroups){
            if(!proctorGroups) return {};
            for(let key in proctorGroups){
                proctorGroups[key] = {
                    name: proctorGroups[key].name,
                    value: proctorGroups[key].value
                };
            }
            return globals.UTILS.sortObjectByKeysAlpha(proctorGroups);
        }

        init() {
            return new Promise(async (resolve, reject) => {
                this.log('Initializing');
                if (this.#ready) return resolve();

                await this.assertUser();
                this.#ready = true;
                resolve();
            });
        }
    }

    // NOTE -- some scripts have dependencies on the IRX global `ExtensionState`
    globals.UserState = globals.ExtensionState = UserState;

})(IRX);
