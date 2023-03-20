/* globals IRX, EventableClass */

(async (globals) => {

    const UI_IMPRESSION_THRESHOLD_MS = 1000;
    const DEBOUNCE_UI_IMPRESSION_EVENT_MS = 15 * 1000;
    const UI = globals.UI;
    const API_TIMEOUT_MS = 1000 * 10; // 10 second timeout for calling an API
    const $ = globals.$;

    class PageFeatureBaseClass extends EventableClass{
        _featureName;
        _configTemplate;
        _mutationObserver;
        _initialized = false;
        _eventsBound = false;
        _wasApiTimeout = false;
        _apiTmo;
        _uiCheckInterval;
        _uiImpressionIdBlocklist = [];

        constructor(featureName, debug, uiCheckInterval = null, configTemplate=null, ){
            super(debug, EventableClass.levels.content);

            // NOTE -- if there are no on-page UI elems, and mutationObserver is not needed, pass in
            // null for uiCheckInterval

            this._featureName = featureName;
            this._configTemplate = configTemplate;
            this._uiCheckInterval = uiCheckInterval;
            this.log(`Page feature component setup, has UI? ${this.hasUi}`);
        }

        get hasUi(){
            return this._uiCheckInterval !== null;
        }

        get lastApiCallFailed(){
            return this._wasApiTimeout;
        }

        get _shouldInitialize(){
            if (!this._initialized) {
                this._initialized = true;
                this.log('Running init');
                return true;
            }
            return false;
        }

        get #shouldBindEvents(){
            if(!this.hasUi) return false;
            if (!this._eventsBound) {
                this._eventsBound = true;
                this.log('Binding events');
                return true;
            }
            return false;
        }

        markUiButtonClick(componentId, componentName, site, sitePage, surface=null, refId=null){
            // NOTE -- we are currently logging repeat button clicks. If we want to change this behavior, we can
            // leverage tracking by componentId
            const action = `${componentName}_button_clicked`;
            this.featureEvent(this._featureName, action, site, sitePage, surface, refId);
        }

        markUiImpression(componentId, componentName, site, sitePage=null, surface=null, refId=null ){
            // NOTE -- we only mark impressiosn for the exact same componentID every <DEBOUNCE_UI_IMPRESSION_EVENT_SECONDS> seconds
            // to mitigate redraws and somewhat realistic user behavior/experience

            const action = `${componentName}_impression`;

            setTimeout(() => {
                let $el = $(`[data-irx-id="${componentId}"]`);
                if (!$el.length) return;

                if(this._uiImpressionIdBlocklist.includes(componentId)){
                    return this.logNoStore('No impression track for ID, still in blocklist.');
                }
                this._uiImpressionIdBlocklist.push(componentId);

                setTimeout(() => {
                    const index = this._uiImpressionIdBlocklist.indexOf(componentId);
                    if(index !== -1) this._uiImpressionIdBlocklist.splice(index, 1);
                }, DEBOUNCE_UI_IMPRESSION_EVENT_MS);

                this.log('Marking UI impression for component!', componentName, componentId);
                this.featureEvent(this._featureName, action, site, sitePage);
            }, UI_IMPRESSION_THRESHOLD_MS);
        }

        cleanup(cleanupListeners=true){
            this._clearApiCallTimer();
            this._cleanupUi();
            if(cleanupListeners) this._cleanupMessageListeners();
            if (this.hasUi && this._mutationObserver) this._mutationObserver.disconnect();
        }

        _init(){
            // function to initialize the class and any listeners, etc, NOTE it must check this._shouldInitialize() before running
            throw new Error('Class must implement _init');
        }

        _bindEvents(){
            // function to call to bind any event listeners.
            // You can assume this is only ever called once on init (don't call in child class) and should be ONLY for
            // DOM-based listeners
            throw new Error('Class must implement _bindEvents');
        }

        _bindMessageListeners(){
            // function to call RELAY and native message listeners
            // this is called on EACH reset, and if using you should also override _cleanupMessageListeners
        }

        _cleanupUi(){
            if(!this.hasUi) return;
            // function called to remove/cleanup any UI on the page that we added
            throw new Error('Class must implement _cleanupUi');
        }

        _cleanupMessageListeners(){
            // optional to override if needed (see _bindMessageListeners)
        }

        _uiChange(){
            if(!this.hasUi) return;
            // function called whenever something in the UI has changed (or page navigation, etc)
            throw new Error('Class must implement _uiChange');
        }

        reset() {
            this.cleanup(false);
            if (!this._initialized) return;
            this.log('Reset called');

            // bindEvents is for DOM based event listers that should be setup ONCE
            if(this.#shouldBindEvents) this._bindEvents();

            this._bindMessageListeners(); // bind RELAY and native message listeners

            if(this.hasUi) {
                this.log('Setting up mutationObserver');
                this._mutationObserver = new MutationObserver(globals.UTILS.debounce(this._uiChange.bind(this), this._uiCheckInterval));
                this._mutationObserver.observe(document.getElementsByTagName('body')[0], {
                    attributes: false, childList: true, subtree: true
                });

                this._uiChange();
            }

            if(!document.getElementById('irxGoogleFont')) {
                // append needed info to head for NOTO-SANS font
                $('head').append('<link rel="preconnect" href="https://fonts.googleapis.com" id="irxGoogleFont">')
                    .append('<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin>')
                    .append('<link href="https://fonts.googleapis.com/css2?family=Noto+Sans&display=swap" rel="stylesheet">');
            }
        }

        _setApiCallTimer(){
            this._wasApiTimeout = false;
            this._apiTmo = setTimeout(this.#apiTimeout.bind(this), API_TIMEOUT_MS);
        }

        _clearApiCallTimer(){
            clearTimeout(this._apiTmo);
        }

        #apiTimeout() {
            this._wasApiTimeout = true;
            if(globals.IS_DEV) console.error('API Timeout!');
            this.log(`Error occurred calling API, timeout after ${API_TIMEOUT_MS} ms`);
            this._error('An error occured. Please contact support if the issue persists');
        }

        _notification(notifications) {
            this.log('NOTIFICATIONS', notifications);
            UI.notification(notifications);
        }

        _error(errors) {
            this.log('ERRORS', errors);
            UI.error(errors);
        }

    }
    globals.PageFeatureBaseClass = PageFeatureBaseClass;

})(IRX);
