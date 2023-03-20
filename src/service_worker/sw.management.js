/* globals IRX */

((globals) => {

    const ALARM_INTERVAL_MINUTES = {
        logsCombineAndPurge:        1,          // Every 1 min - interleave, combine, and purge old logs
        mgmtCheckVersion:           5,          // Every 5 mins - check for new version
        mgmtCheckSettings:          3,          // Every 3 mins - check user settings changes
        phoneHome:                  60          // Every 1 hr, ping so we know who has extension enabled/logged in
    };
     ALARM_INTERVAL_MINUTES.logsCombineAndPurge = 20; // purge/combine logs every 20 minutes

    const START_TIME_KEY = 'irxStartTime';
    const NEEDS_UPDATE_KEY = 'irxNeedsUpdate';

    class Management extends IRX.ServiceWorkerBaseClass {
        #installId;
        #localRemoteVersion;
        #externallyConnectibleTlds;

        constructor() {
            super(false, 'SW_MANAGEMENT');
            this.#externallyConnectibleTlds = chrome.runtime.getManifest().externally_connectable.matches.map(globals.UTILS.tldFromDomain);
            this.#setup();
        }

        get needsUpdateStoreKey(){
            return NEEDS_UPDATE_KEY;
        }

        get startTimeStoreKey(){
            return START_TIME_KEY;
        }

        registerAlarms(){
            this._addAlarm(this.checkVersion, ALARM_INTERVAL_MINUTES.mgmtCheckVersion);
            this._addAlarm(this._checkSettings, ALARM_INTERVAL_MINUTES.mgmtCheckSettings, true);
            this._addAlarm(this._combineAndPurgeLogs.bind(this), ALARM_INTERVAL_MINUTES.logsCombineAndPurge, globals.IS_DEV);
            this._addAlarm(this.phoneHome, ALARM_INTERVAL_MINUTES.phoneHome, true, true);
        }

        fetchVersionMeta(){
            return new Promise(async (resolve, reject) => {

                const majorVersion = chrome.runtime.getManifest().version.split('.')[0];
                const path = (this.useRemote ? `meta/${majorVersion}/` : '') + 'irx.meta.json';
                const url = `${this.remoteUrl}${path}`;
                const noncedUrl = globals.UTILS.appendQueryParamToUrl(url, 'nonce', Date.now());
                this.log('Fetching version from remote', noncedUrl);
                try {
                    const meta = await globals.UTILS.getJsonRetry(noncedUrl, 10, 400);
                    resolve({
                        version: meta.version,
                        requiredInstallVersion: meta.requiredInstallVersion
                    });
                }catch(e) {
                    reject(e);
                }
            });
        }

        get remoteUrl(){
            return 'https://irx-extension-files-prod.irx.indeed.com/';
        }

        get useRemote(){
            return 'true' === 'true';
        }

        // incoming comm messages from dashboard pages
        async #externalMessageRecieved(request, sender, sendResponse){
            const senderTld = globals.UTILS.tldFromDomain(sender.url);

            if(!this.#externallyConnectibleTlds.includes(senderTld)){
                return this.log(`Blocking message from ${sender.url}`);
            }

            switch(request.message){
            case 'triggerUserUpdate':
                this.log('triggerUserUpdate external message called.');
                // Called on preference page after updates to user, so extension pulls updated info
                // Also called from alarm to periodically check in case proctor has changed
                await globals.state.assertUser(true);
                break;
            case 'getState':
                const response = {
                    version: await globals.storeUtils.get('version'),
                    reminders: await globals.storeUtils.get('reminders') || {},
                    isPinned: await globals.extensionUtils.isExtensionIconPinned(),
                    env: await this.getEnv()
                };
                this.log('Sending getState response to external', response);
                sendResponse(response);
                break;
            case 'getLogs':
                this.log('getLogs external message called.');
                const logs = await globals.LOG_TOOLS.getLogs();
                sendResponse(logs);
                break;
            }
        }

        #setup() {
            chrome.runtime.onInstalled.addListener(this.#onInstall.bind(this));
            // NOTE -- to enable these we need to add the 'management' permission, which would trigger a user warning
            // but we should do so when we next add any permission that also triggers a warning
            // chrome.management.onDisabled.addListener(this.#onDisabled.bind(this));
            // chrome.management.onEnabled.addListener(this.#onEnabled.bind(this));

            chrome.runtime.onMessageExternal.addListener(this.#externalMessageRecieved.bind(this));
        }

        async _combineAndPurgeLogs(){
            await globals.LOG_TOOLS.combineAndPurge();
        }

        async phoneHome(){
            const loggedIn = globals.state.loggedIn;
            const event = `extension_phone_home_logged_${loggedIn ? 'in' : 'out'}`;
            this.lifecycleEvent(event);
        }

        async _checkSettings(){
            if(!navigator.onLine) return this.log('Not running _checkSettings, offline.');

            const settings = await chrome.action.getUserSettings();
            const isPinned = settings.isOnToolbar;
            const wasPinned = await globals.storeUtils.get('isPinned') || false;
            // NOTE equality checking to boolean is required, since initial value is null and we want to do
            // nothing in that case
            if(!wasPinned && isPinned){
                this.log('User pinned browser action, firing event!');
                this.lifecycleEvent('extension_pinned');
            }else if(wasPinned && !isPinned){
                this.log('User unpinned browser action, firing event');
                this.lifecycleEvent('extension_unpinned');
            }
            await globals.storeUtils.set('isPinned', isPinned);
        }

        async checkVersion(){
            if(!navigator.onLine) return this.log('Not running checkVersion, offline.');

            const curInstallVersion = chrome.runtime.getManifest().version;
            let curMajorRemoteVersion, requiredInstallVersion;

            // Grab meta file JSON from remote server (based on current major version)
            try{
                const meta = await this.fetchVersionMeta();
                curMajorRemoteVersion = meta.version;
                requiredInstallVersion = meta.requiredInstallVersion;
            }catch(e){
                console.error('Unable to fetch metadata info!', e);
                globals.extensionUtils.setAlertBadge();
                return;
            }

            // If initial load of remote version, store it
            if(!this.#localRemoteVersion){
                this.#localRemoteVersion = curMajorRemoteVersion;
                await globals.storeUtils.set('version', curMajorRemoteVersion);
            }

            const packageType = globals.UserState.platformInfo.package;
            // Where case is not sideload, and we aren't in local dev, trigger request update from chrome web store
            // (so hopefully the extension just auto-updates on it's own with no user interaction)
            if(packageType !== 'sideload' && !globals.IS_DEV) {
                const updateInfo = await chrome.runtime.requestUpdateCheck();
                if (updateInfo.status === 'update_available') {
                    // If Chrome update is available from webstore, trigger restart in hopes it'll be installed
                    // NOTE only do this max every 15 mins so we don't cause a restart death loop while update is pending
                    this.log('Attempting restart due to pending update.');
                    return await globals.extensionUtils.restartIfAllowed();
                }
            }

            // If the current version is outdated and there's a higher required version
            if(!globals.UTILS.semverEqualOrGreater(curInstallVersion, requiredInstallVersion)){
                console.error('Invalid installation requirement!');
                this.log('Invalid installation version', curInstallVersion, requiredInstallVersion);
                // possible chrome store update is pending OR it's sideloaded extension and needs new install

                // No pending update -- so version mismatch means update is stuck OR user has sideloaded version
                // We force extension into state where it shows alert and lets user know update is needed
                await globals.storeUtils.set(this.needsUpdateStoreKey, true);
                return globals.extensionUtils.setAlertBadge();

            }else{
                await globals.storeUtils.set(this.needsUpdateStoreKey, false);
            }

            this.log('was version update? currrent, new', this.#localRemoteVersion, curMajorRemoteVersion);
            if(this.#localRemoteVersion !== curMajorRemoteVersion){
                // If remote version (for this major version) is higher than it was before, set that value locally
                // then reload supported tabs (so CORE iframe loaded is newest version)

                this.log('New version detected, setting value and reloading tabs!');
                await globals.storeUtils.set('version', curMajorRemoteVersion);
                this.#localRemoteVersion = curMajorRemoteVersion;
                this.setUninstallUrl();
                globals.extensionUtils.reloadSupportedTabs();
            }
        }

        async setUninstallUrl(){
            if(globals.IS_DEV) return this.log('Not setting uninstall URL, in dev mode');
            const url = await globals.events.buildUninstallUrl();
            this.log('Setting uninstall URL', url);
            chrome.runtime.setUninstallURL(url);
        }

        async #onDisabled(details){
            // details.disabledReason can be 'permission_increase' or 'unknown'
            await this.lifecycleEvent('extension_disabled');
        }

        async #onEnabled(){
            await this.lifecycleEvent('extension_enabled');
        }

        async #onInstall(details) {
            if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
                this.lifecycleEvent('installed');
                if(!globals.IS_DEV) {
                    let dashboardUrl = globals.UserState.getApiInfoForEnv(await this.getEnv()).dashboardUrl;
                    globals.extensionUtils.openUrl(dashboardUrl);
                }
            }
        }

        get installId(){
            return this.#installId;
        }

        setInstallId(){
            return new Promise(async (resolve) => {
                let installId = await globals.storeUtils.get('installId');
                if(!installId){
                    installId = globals.UTILS.generateGuid();
                    await globals.storeUtils.set('installId', installId);
                }
                this.log('InstallID', installId);
                this.#installId = installId;
                resolve(installId);
            });
        }
    }

    globals.Management = Management;
})(IRX);
