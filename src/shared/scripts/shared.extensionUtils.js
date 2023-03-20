/* globals IRX */

((globals) => {

    const POPUP_HTML_PATH = 'src/popup/popup.html';
    const DEFAULT_RESTART_WAIT_ALLOW_MINS = 15;

    class ExtensionUtils extends globals.LoggableClass {
        constructor() {
            super(false, 'EXTENSION UTILS');
        }

        async isExtensionIconPinned(){
            return (await chrome.action.getUserSettings()).isOnToolbar;
        }

        openUrl(url, active= true) {
            if(active !== true && active !== false) active = true; // handle null/undefined
            this.log('Opening URL', url);
            return chrome.tabs.create({active, url});
        }

        openPopupDebugWindow(){
            let url = globals.UTILS.extensionUrl(POPUP_HTML_PATH);
            url = globals.UTILS.appendQueryParamToUrl(url, 'messageDebug','true');
            this.openUrl(url, true);
        }

        async reloadSupportedTabs() {
            this.log('Reloading supported tabs');
            const manifest = chrome.runtime.getManifest();
            let matches = [];
            manifest.content_scripts.forEach(scriptDef => {
                matches = matches.concat(scriptDef.matches);
            });
            const tabs = await chrome.tabs.query({url: matches});
            const allTabids = tabs.flat().map((tab) => tab?.id)
                .filter((id) => id !== undefined && id !== chrome.tabs.TAB_ID_NONE);
            const uniqueTabIds = [...new Set(allTabids)];
            uniqueTabIds.forEach(tabId => {
                chrome.tabs.reload(tabId, {bypassCache: true});
            });
        }

        async clearBadge(){
            this.log('Clearing badge.');
            await chrome.action.setBadgeText({text: ''});
        }

        async showBadge(){
            this.log('Showing standard notification badge');
            // TODO -- what color are we using?
            await chrome.action.setBadgeBackgroundColor({color: [217, 58, 64, 1]});
            /*
                NOTE -- chrome.action.setBadgeTextColor is NOT YET RELEASED!
                https://developer.chrome.com/docs/extensions/reference/action/#method-setBadgeTextColor
             */
            try{
                await chrome.action.setBadgeTextColor({color: '#ffffff'});
            }catch(e){}
            await chrome.action.setBadgeText({text: ' '});
        }

        async clearBadgeText(){
            // TODO - LEGACY deprecate this call
            await this.clearBadge();
        }
        
        async setBadgeCount(count=0) {
            // TODO - LEGACY deprecate this call
            if (count === 0) {
                return await this.clearBadge();
            }
            await this.showBadge();
        }

        async setBadgeText(text='') {
            // TODO - LEGACY deprecate this call
            if(text === ''){
                return await this.clearBadge();
            }
            await this.showBadge();
        }

        async setAlertBadge() {
            this.log('Set alert badge.');
            await chrome.action.setBadgeText({text: '!'});
            await chrome.action.setBadgeBackgroundColor({color: [209, 209, 209, 1]});
            /*
                NOTE -- chrome.action.setBadgeTextColor is NOT YET RELEASED!
                https://developer.chrome.com/docs/extensions/reference/action/#method-setBadgeTextColor
             */
            try{
                await chrome.action.setBadgeTextColor({color: [37, 67, 187, 1]});
            }catch(e){}
        }

        async reload(){

        }

        async restartIfAllowed(waitMins = DEFAULT_RESTART_WAIT_ALLOW_MINS, beforeRestartAsyncFn=null, reloadSupportedTabs=true){
            // NOTE -- passing in null or zero for waitMains is essentially a force reload

            this.log('Attemptint to restart extension.');

            if(waitMins) {
                let minsSinceRestart = (Date.now() - (await globals.storeUtils.getSession('globalsStartTime'))) / 1000 / 60;

                if (minsSinceRestart < waitMins) {
                    return this.log(`Restart triggered, but extension restarted less than ${waitMins} mins ago. Not restarting.`);
                }
            }

            if(beforeRestartAsyncFn) await beforeRestartAsyncFn();

            // set variable indicating tabs should be reloaded
            if(reloadSupportedTabs) await globals.storeUtils.set('reloadSupportedTabs', true);
            await globals.writeoutPendingLogs();
            await globals.LOG_TOOLS.combineAndPurge();
            return chrome.runtime.reload();
        }
    }

    globals.extensionUtils = new ExtensionUtils();

})(IRX);
