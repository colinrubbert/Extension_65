/* globals IRX */

(async (globals) => {

    const frameBridge = new globals.FrameBridge(false);
    globals.LOGGER.setFrameId(frameBridge.frameId);

    // Initialize the state/store
    // console.log('FRAME ID IS', frameBridge.frameId);
    const state = new globals.ExtensionState(true, frameBridge.version);

    // initialize the state, and check/fetch login details
    try{
        const bridgeIframeUrl = state.getRemoteUrl('src/core/coreIframe.html');
        await frameBridge.setupRemote(bridgeIframeUrl);
        await state.init(true);
    }catch(e){
        console.error('Unable to init Extension state!', e);
        return;
    }

    // callback to alert content script that bridge is fully setup and ready
    frameBridge.markReady();

    globals.STATE = state;

})(IRX);
