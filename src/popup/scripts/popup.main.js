/* globals IRX */

(async (globals) => {

    // Handle case where browser is offline
    if(!navigator.onLine){
        console.error('Computer is currently offline!');
        return document.getElementById('offline').style = ''; // clear display none
    }

    // Setup frameID & logging
    const frameId = new Date().getTime();
    globals.LOGGER.setFrameId(frameId);

    // Function for generic error (if metadat fetch error, issue with XCOM, etc)
    const genericError = () => {
        document.getElementById('generic_error').style = ''; // clear display none
    };

    // Bind listerner for 'Reload' button click
    document.getElementById('reload_extension').addEventListener('click', async () => {
        await globals.extensionUtils.restartIfAllowed(0);
    });

    // Wire up XCOM component
    const COMPONENT_NAME = 'irxPopup';
    const xcom = new globals.XComWindow({}, COMPONENT_NAME, genericError);

    // Initialize the state and await remote version (initial extension setup)
    let version;
    try{
        version = await globals.ExtensionState.awaitRemoteVersion();
    }catch(e){
        if(e instanceof globals.ExtensionVersionError){
            return genericError();
        }
    }

    // Initialize the state and the load the store / user login info
    const state = globals.STATE = new globals.ExtensionState(true, version);
    try{
        await state.init();
    }catch(e){
        xcom.clearLoading();

        // If the extension is out of data and needs a forced update, show that UI
        if(e instanceof globals.ExtensionVersionError){
            document.getElementById('needs_update').style = ''; // clear display none
            const link = document.getElementById('update_url');
            link.href = globals.UTILS.appendQueryParamToUrl(globals.ExtensionState.platformInfo.updateUrl, 'nonce', Date.now());
            return;
        }
    }

    if(!state.loggedIn && !(await globals.authCookies.currentlySetAuthCookieKeys()).includes('PCA')){
        xcom.clearLoading();
        document.getElementById('no_advertiser_error').style = ''; // clear display none
        const advBtn = document.getElementById('select_advertiser_url');
        advBtn.href = globals.ExtensionState.getAdvertiserSelectionUrlForEnv(state.env);
        return;
    }

    // Setup the bindings + comm for oneHost iframe, and build the envInfo payload sent to it
    globals.iframeBindings = new globals.IframeBindings(state, COMPONENT_NAME);

    let envInfo = {
        extractAvailable: await globals.EXTRACT.extractEnabledOnCurrentPage(),
        stateInfo: state.info,
        availableEnvs: state.availbleEnvironments,
        version: state.version,
        windowUrl: window.location.href,
        userInfo: state.userInfo
    };
    console.info('Popup envInfo', JSON.parse(JSON.stringify(envInfo)));

    xcom.updateStateInfo(envInfo);
    // Now load the actual oneHost iframe
    xcom.setWindowURL(state.info.api.popupOnehostUrl);
})(IRX);

