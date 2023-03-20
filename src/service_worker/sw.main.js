/* globals IRX */

((globals) => {

    function isExtensionStartup() {
        return new Promise(async (resolve) => {
            resolve(!(await globals.storeUtils.getSession('irxStartTime')));
        });
    }

    const frameId = `SW@${new Date().getTime()}`;
    globals.LOGGER.setFrameId(frameId);
    console.log(`STARTING UP ${frameId}${globals.IS_DEV ? ' (DEV MODE)' : ''}`);

    /*
        NOTE -- all listener setup calls (aka chrome.<API>.onChanged.addListener) MUST be definted in the first
        synchronous execution loop of this file, and cannot be setup after any async calls or they will not
        work properly! You don't have to be concerned about them being executed/bound multiple times as the service
        worker starts/stops/reloads, chrome handles only binding listeners ONCE.Anything other than that you want to only
        happen on initial startup, move to the async isExtensionStartup() call at the bottom.
     */

    const management = globals.management = new globals.Management();
    const state = globals.state = new globals.UserState();
    const notificationSync = globals.notificationSync = new globals.NotificationSync(state);

    addEventListener('install', (event) => {
        // force this new worker to take over and evict old one
        self.skipWaiting();
    });

    isExtensionStartup().then(async isStartup => {
        // NOTE we are only registering alarms, doing login check init, etc on initial startup

        await management.setInstallId();
        await globals.storeUtils.setSession(management.startTimeStoreKey, Date.now());
        await globals.storeUtils.set(management.needsUpdateStoreKey, false);

        await management.checkVersion();
        await management.setUninstallUrl();

        // setup user state / login info
        await globals.storeUtils.set('userAsserted', false);
        await state.init();

        const reloadSupportedTabs = globals.IS_DEV || await globals.storeUtils.get('reloadSupportedTabs');
        if(reloadSupportedTabs) globals.extensionUtils.reloadSupportedTabs();
        await globals.storeUtils.set('reloadSupportedTabs', false);

        globals.WORKAROUNDS.resetWatchdog();

        console.log('CURENT ENV IS', await management.getEnv());

        if(globals.IS_DEV){
            // globals.extensionUtils.openPopupDebugWindow();
        }
    });

})(IRX);
