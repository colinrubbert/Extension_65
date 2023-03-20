/* globals IRX, LoggableClass */

((globals) => {
    const UNINSTALL_URL_PATH = '/public/redirect/uninstallation';
    const ONLINE_CHECK_INTERVAL_MS = 800;

    class Events extends LoggableClass{
        #pendingEvents = [];
        #online = navigator.onLine;

        constructor() {
            super(false);

            globals.RELAY.on('feature.event', this.#featureEvent.bind(this));
            globals.RELAY.on('lifecycle.event', this.#lifecycleEvent.bind(this));

            // service workers don't support window.addEventListener('online') so we're leveraging polling unfortunately
            setInterval(() => {
                if(navigator.onLine && !this.#online){
                    this.#online = true;
                    this.#pushPendingEvents();
                }else if(!navigator.onLine && this.#online){
                    this.#online = false;
                }
            }, ONLINE_CHECK_INTERVAL_MS);
        }

        async #api(){
            if(!this.#api) {
                const {apiUrl, proxyHost} = globals.ExtensionState.getApiInfoForEnv(await this.getEnv());
                this.#api = new globals.Api(apiUrl, proxyHost);
            }
            return this.#api;
        }

        #pushPendingEvents(){
            this.log(`Browser back online, pushing ${this.#pendingEvents.length} events.`);
            this.#pendingEvents.forEach(async (e) => {
                const {path, payload, resolve, reject} = e;
                await this.#eventPost(path, payload, resolve, reject);
            });
            this.#pendingEvents = [];
        }

        async #pushEvent(path, payload){
            return new Promise(async (resolve, reject) => {
                if(!navigator.onLine){
                    // wait until we are online to try these events again
                    this.#pendingEvents.push({
                        path, payload, resolve, reject
                    });
                    this.#online = false;
                    return this.log('Not pushing event, browser is offline. Queueing for later.');
                }

                this.#eventPost(path, payload, resolve, reject);
            });
        }

        async #eventPost(path, payload, resolve, reject){
            const api = await globals.Api.getApi(globals.ExtensionState, await this.getEnv());

            try {
                const response = await api.call(path, 'POST', payload, false);
                this.log(`Api event call complete, status=${response.status}`);
                if (!response.ok) {
                    this.log('API event call failed', response.status);
                    return reject(response);
                }
                this.log('API event call successful');
                resolve();

            } catch (e) {
                this.log('Error in API call', e.toString());
                reject(e);
            }
        }

        async #lifecycleEvent(data){
            const {event} = data;

            const payload = {event};
            Object.assign(payload, await this.#staticEventData());
            this.log('Creating lifecycle event', event);
            this.logNoStore('Full lifecycle event paypload:', payload);

            let eventSuccess = true;
            try{
                await this.#pushEvent('/public/logrepo/lifecycle', payload);
            }catch(e){
                eventSuccess = false;
                console.error(e);
                this.logNoStore('Error sending lifecycle event!', payload);
                this.log('Error sending lifecycle event!');
                globals.Sentry.captureException(e);
            }

            this.#eventRespond(eventSuccess, data._eventId, data._originLevel);
        }

        async #featureEvent(data){
            const {feature, action, site, sitePage, surface, refId} = data;

            const payload = {
                feature, action, site, sitePage, surface,
                ref_id: refId
            };
            Object.assign(payload, await this.#staticEventData());
            this.log('Creating feature event', feature, action);
            this.logNoStore('Full feature event paypload:', payload);

            let eventSuccess = true;
            try{
                await this.#pushEvent('/public/logrepo/activity', payload);
            }catch(e){
                eventSuccess = false;
                console.error(e);
                this.logNoStore('Error sending feature event!', payload);
                this.log('Error sending feature event!');
                globals.Sentry.captureException(e);
            }

            this.#eventRespond(eventSuccess, data._eventId, data._originLevel);
        }

        #eventRespond(eventSuccess, eventId, originLevel){
            const respondMsg = `confirmSent_${eventId}.event`;
            const data = {eventSuccess};

            if(!originLevel || originLevel === globals.RELAY.curLevel()){
                globals.RELAY.localSend(respondMsg, data);
            }else{
                globals.RELAY.send(respondMsg, originLevel, data);
            }
        }

        async #staticEventData(){
            return {
                product: globals.ExtensionState.platformInfo.platform,
                product_package: globals.ExtensionState.platformInfo.package,
                product_version: await globals.storeUtils.get('version') || chrome.runtime.getManifest().version,
                client_guid: await globals.storeUtils.get('installId'),
                client_timestamp: Date.now()
            };
        }

        async buildUninstallUrl(){
            const url = globals.ExtensionState.getApiInfoForEnv(await this.getEnv()).apiUrl + UNINSTALL_URL_PATH;
            const params = await this.#staticEventData();
            return url + '?' + new URLSearchParams(params).toString();
        }
    }

    globals.events = new Events();

})(IRX);
