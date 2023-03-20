/* globals IRX, LoggableClass */

(async (globals) => {

    const RELAY = globals.RELAY;

    const dashboardUrl = globals.ExtensionState
        .getApiInfoForEnv(await globals.storeUtils.get('env') || 'production').dashboardUrl;

    const COMPONENT_NAME = 'commShim';

    class XcomShim extends LoggableClass {
        constructor() {
            super(false);

            const url = globals.UTILS.getQueryParam('url');
            if(!url) return this._error('No url supplied to load for xcom!');

            this._id = globals.UTILS.getQueryParam('xcomId', url.split('?').pop());
            if(!this._id) return this._error('No xcomId in supplied URL');

            try{
                this._metadata = JSON.parse(globals.UTILS.getQueryParam('data'));
                this.log('Data from URL', this._metadata);
            }catch(e){
                this._error(e);
            }

            // ** LEGACY XCOM FUNCTIONALITY TO DASHBOARD ** //

            // 'ready' is called right away from xcom component in dashboard
            RELAY.on(`${this._id}_ready.legacyXcom`, () => {
                this.log('legacy xcom ready.', this._id);
                RELAY.send(`${this._id}_setMetadata.legacyXcom`, RELAY.levels.iframe, this._metadata);
                this.xcom.isLoaded();
            });

            // 'openTab' is called when a new tab should be opened (like API push, csv extract, etc)
            RELAY.on(`${this._id}_openTab.legacyXcom`, (data) => {
                globals.extensionUtils.openUrl(data.url, data.active);
            });

            // 'exit' is called when user clicks 'X' or outside modal
            RELAY.on(`${this._id}_exit.legacyXcom`, () => {
                RELAY.send('exit.xcomShim', RELAY.levels.content);
            });

            RELAY.on('error.xcomWindow', (data) => {
                this._error(data.error);
            });

            this.xcom = new globals.XComWindow(this._metadata, COMPONENT_NAME);
            this.xcom.setWindowURL(dashboardUrl + url);
        }

        _error(e){
            this.log('Error in shim!', e);
            RELAY.send('error.xcomShim', RELAY.levels.content, {error: e.toString()});
        }

    }

    // TODO!
    //const iframeBindings = new IframeBindings(state, COMPONENT_NAME);
    globals.XCOM_SHIM = new XcomShim();

})(IRX);

