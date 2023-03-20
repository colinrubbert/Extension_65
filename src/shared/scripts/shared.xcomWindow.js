/* globals IRX */

((globals) => {
    const relayDebug = false;
    const LOAD_WAIT_TIMEOUT = 8000; // wait for 8 seconds until we assume a load error
    const LOADED_CSS_CLASS = 'loaded';

    // NOTE -- is this needed? In nearly every (if not every) case the relay is already setup from the logger
    const isStandaloneWindow = window.self === window.top;
    globals.RELAY = globals.RELAY || window.chrome_extension_message_relay('IRX', isStandaloneWindow ? 'page' : 'iframe_shim', relayDebug);
    
    // TODO refactor this to handle more than 1 XCOM window if needed?

    class XComWindow extends globals.LoggableClass {
        #componentName;
        #stateInfo;
        #loadWaitTimeout;
        #hasTimedOut = false;
        #errorCallbackFn;
        #loadWaitTmo;

        constructor(stateInfo, componentName, errorCallbackFn=null, loadWaitTimeout=LOAD_WAIT_TIMEOUT){
            super(false, 'XCOM WINDOW');

            this.#componentName = componentName;
            this.#stateInfo = stateInfo;
            this.#loadWaitTimeout = loadWaitTimeout;
            this.#errorCallbackFn = errorCallbackFn;
            this.#setup();
        }

        #setup(){
            this.iframe = document.getElementById(`xcom@${this.#componentName}`);
            this.#setLoading();
            globals.RELAY.setComponentEnvData(this.#stateInfo);
            this.log('set ENV data', this.#stateInfo);
            globals.RELAY.registerComponentInitializedCb((componentName, iframe, iframeWin) => {
                this.isLoaded();
            }, this.#componentName);

            // allow for handling iframe reloading
            globals.RELAY.componentOn( 'iframeReloading', this.#componentName, () => {
                this.log('iframe reload triggered!');
                this.#setLoading();
            });
        }

        updateStateInfo(info){
            this.log('update ENV data', this.#stateInfo);
            this.#stateInfo = info;
            globals.RELAY.setComponentEnvData(this.#stateInfo);
        }

        #setLoading(){
            this.#loadWaitTmo = setTimeout(this.timeoutError.bind(this), this.#loadWaitTimeout);
            this.iframe.classList.remove(LOADED_CSS_CLASS);
            this.#addLoading();
        }

        #loadError(){
            this.clearLoading();
            if(this.#errorCallbackFn) return this.#errorCallbackFn();

            let div = document.createElement('div');
            div.classList.add('irx_xcomwin_error');
            div.textContent = 'An error has occured loading the window. Please contact support if the problem persists.';
            document.body.appendChild(div);
        }

        #addLoading(){
            this.log('set the window as loading');
            let div = document.createElement('div');
            div.classList.add('ifl-loading-spinner');
            document.body.appendChild(div);
            this.loadingDiv = div;
        }

        timeoutError(){
            if(this.#hasTimedOut) return;
            this.#hasTimedOut = true;
            globals.RELAY.send('error.xcomWindow', globals.RELAY.levels.iframe_shim, {error: 'Waiting for xcom timed out.'});
            this.log(`Timeout error after waiting ${this.#loadWaitTimeout} ms`);
            this.#loadError();
        }

        setWindowURL(url){
            this.iframe.setAttribute('src', url);
        }

        clearLoading(){
            clearTimeout(this.#loadWaitTmo);
            if(this.loadingDiv) {
                document.body.removeChild(this.loadingDiv);
                this.loadingDiv = null;
            }
        }

        isLoaded(){
            this.log('page loaded and initialized');
            this.clearLoading();
            this.iframe.classList.add(LOADED_CSS_CLASS);
        }
    }
    globals.XComWindow = XComWindow;

})(IRX);
