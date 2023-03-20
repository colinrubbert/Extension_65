/* globals IRX */

((globals) => {
    const VERSION_CHECK_AWAIT_TIMEOUT_MS = 1000 * 10; // 10 seconds

    // custom errors defined for state error cases
    class ExtensionVersionError extends Error {}
    class ExtensionMetaFetchError extends Error {}

    class StateBaseClass extends IRX.EventableClass {
        _env = null;
        _version = null;
        _irxUserUuid;
        _advertisers;
        _advertiserKey;
        _proctorGroups;
        _preferences;
        _reminders = {};
        _integrations = [];

        // each of these is exposed below as a getter, with a private _ value to set
        // if anything is added to state_keys, it needs a new getter below + whitelisting in STORE
        _USER_STATE_KEYS = ['irxUserUuid', 'advertisers', 'advertiserKey',
            'proctorGroups', 'preferences', 'integrations'];
        // list of keys that are not written/deleted based on login but instead rememberd per accountID per installation
        _USER_INSTALLATION_KEYS = ['reminders'];

        constructor(debug, logName) {

            super(debug, logName);
            this.allUserKeys.forEach(key => this[`_${key}`] = null); // set internal value for each
        }

        get irxUserUuid(){ return this._irxUserUuid; }
        get advertisers(){ return this._advertisers; }
        get advertiserKey(){ return this._advertiserKey; }
        get proctorGroups(){ return this._proctorGroups; }
        get preferences(){ return this._preferences; }
        get reminders(){ return this._reminders || {}; }
        get integrations(){ return this._integrations || []; }
        get env() { return this._env; }
        get version(){ return this._version; }

        get allUserKeys(){
            return [...this._USER_STATE_KEYS, ...this._USER_INSTALLATION_KEYS];
        }

        get userInfo(){
            let info = {};
            this.allUserKeys.forEach(key => info[key] = this[key]);
            return globals.UTILS.sortObjectByKeysAlpha(info);
        }

        get stateInfo(){
            let info = {
                user: this.userInfo,
                env: this._env
            };
            const pInfo = this.constructor.platformInfo;
            for(let key in pInfo){
                info[key] = pInfo[key];
            }
            return info;
        }

        // get a list of all available environments that the extension can be set to, by name
        get availbleEnvironments(){
            let envs = Object.keys(ENV_API_MAP);
            if(envs.includes('sandbox')){
                envs.splice(envs.indexOf('sandbox'), 1);
                for(let i=1; i<= NUM_SANDBOXES; i++) envs.push(`sandbox${i}`);
            }
            return envs;
        }

        // is the user logged in (irxUserUuid + advertiser list + proctor set)
        get loggedIn(){
            return !!(this.irxUserUuid && this.advertisers && this.advertisers.length && this.advertiserKey);
        }

        // get all needed extension state info (requires init)
        get info() {
            let returns = {
                api: Object.assign({}, this.apiInfoForEnv),
                state: Object.assign({}, this.stateInfo)
            };
            return returns;
        }

        // get API info for the current environ (api url, proxy host) - (requires init)
        get apiInfoForEnv() {
            return this.constructor.getApiInfoForEnv(this._env);
        }

        proctorEnabled(flagName){
            if(!this.userInfo) return false;
            return !!(this.userInfo.proctorGroups || {})[flagName];
        }

        preferenceEnabled(preferenceKey){
            return !!(this.userInfo.preferences || {})[preferenceKey];
        }

        _formatPreferences(preferences){
            // force preferences into top-level key format, removing old-school irrelevent grouping if still present
            // NOTE all top-level keys, other than general, are thrown away!
            if('general' in preferences) {
                preferences = preferences.general;
                // now change snakecase to camelcase
                for (let key in preferences) {
                    const newKey = key.replace(/(_\w)/g, k => k[1].toUpperCase());
                    preferences[newKey] = preferences[key];
                    delete preferences[key];
                }
            }
            return preferences;
        }

        static awaitUserAsserted(timeout=8000){
            return new Promise(async (resolve, reject) => {

                let intervalTmo;
                let timeoutTmo = setTimeout(() => {
                    clearInterval(intervalTmo);
                    reject(`Timeout waiting for awaitUserAsserted after ${timeout} ms`);
                }, timeout);
                const checkFn = async () => {
                    if(await globals.storeUtils.get('userAsserted')){
                        clearTimeout(timeoutTmo);
                        clearInterval(intervalTmo);
                        resolve();
                    }
                };
                intervalTmo = setInterval(checkFn,800);
                checkFn();
            });
        }

        static getApiInfoForEnv(env) {
            let checkEnv = env.replace(/sandbox([0-9]+)/, 'sandbox');
            let {apiUrl, proxyHost, popupOnehostUrl, dashboardUrl, pieAdvertiserSelectUrl} = ENV_API_MAP[checkEnv];
            if (checkEnv === 'sandbox'){
                proxyHost = proxyHost.replace('<SANDBOX>', env);
                dashboardUrl = dashboardUrl.replace('<SANDBOX>', env);
            }
            return {apiUrl, proxyHost, popupOnehostUrl, dashboardUrl, pieAdvertiserSelectUrl};
        }

        static getAdvertiserSelectionUrlForEnv(env){
            const apiInfo = this.getApiInfoForEnv(env);
            return globals.UTILS.appendQueryParamToUrl(apiInfo.pieAdvertiserSelectUrl, 'continue', apiInfo.dashboardUrl);
        }

        static get platformInfo(){
            return {
                platform: 'extension',
                package: 'chrome',
                updateUrl: 'https://chrome.google.com/webstore/detail/indeed-recruiter-extensio/kiodpphbmnmcmnfgpnmkkhmkllnlflef'
            };
        }

        static awaitRemoteVersion(){
            const majorVersion = chrome.runtime.getManifest().version.split('.')[0];
            return new Promise((resolve, reject) => {
                let checkTmo, waitTmo = false;
                waitTmo = setTimeout(() => {
                    clearTimeout(checkTmo);
                    reject(new ExtensionMetaFetchError('Timeout awaiting for version check return.'));
                }, VERSION_CHECK_AWAIT_TIMEOUT_MS);

                const checkInterval = async () => {
                    const val = await globals.storeUtils.get('version');
                    //console.log('Version check fetch result', val);
                    if(!val){
                        // console.log('Version missing in await check, sleeping!');
                        checkTmo = setTimeout(checkInterval, 500);
                        return;
                    }
                    let verMajor = val.split('.')[0];
                    if(verMajor !== majorVersion){
                        // console.log('Old/mismatched major version, sleeping!');
                        checkTmo = setTimeout(checkInterval, 500);
                        return;
                    }
                    clearTimeout(waitTmo);
                    clearInterval(checkInterval);
                    resolve(val);
                };
                checkInterval();
            });
        }
    }

    const NUM_SANDBOXES = 6;
    const ENV_API_MAP = Object.freeze({
        dev: {
            apiUrl: 'https://irx-api.sandbox.qa.indeed.net', // TODO - http://localhost:8084/irx-api/
            proxyHost: 'backend.qa.zapinfo.io', // TODO https://zapinfo.test:9000',
            pieAdvertiserSelectUrl: 'https://pie.sandbox.qa.indeed.net/o/myaccess', // TODO localhost equiv?
            popupOnehostUrl: 'https://employers.qa.indeed.net/o/playground?scope=marketplace-irx&module=.%2FApp&headless=true',
            dashboardUrl: 'http://localhost:4200'
        },
        sandbox: {
            apiUrl: 'https://irx-api.sandbox.qa.indeed.net',
            proxyHost: 'backend.<SANDBOX>.zapinfo.io',
            popupOnehostUrl: 'https://employers.qa.indeed.net/irx-popup',
            pieAdvertiserSelectUrl: 'https://pie.sandbox.qa.indeed.net/o/myaccess',
            dashboardUrl: 'https://my.<SANDBOX>.irx.qa.indeed.net' // 'http://localhost:4200' 'https://my.<SANDBOX>.irx.qa.indeed.net'
        },
        qa: {
            apiUrl: 'https://irx-api.sandbox.qa.indeed.net',
            proxyHost: 'backend.qa.zapinfo.io',
            pieAdvertiserSelectUrl: 'https://pie.sandbox.qa.indeed.net/o/myaccess',
            popupOnehostUrl: 'https://employers.qa.indeed.net/irx-popup',
            dashboardUrl: 'https://my.irx.qa.indeed.net'
        },
        production: {
            apiUrl: 'https://irx-api.indeed.com',
            proxyHost: 'backend.zapinfo.io',
            pieAdvertiserSelectUrl: 'https://account.indeed.com/myaccess',
            popupOnehostUrl: 'https://employers.indeed.com/irx-popup',
            dashboardUrl: 'https://my.irx.indeed.com'
        }
    });

    globals.StateBaseClass = StateBaseClass;

    globals.ExtensionMetaFetchError = ExtensionMetaFetchError;
    globals.ExtensionVersionError = ExtensionVersionError;

})(IRX);
