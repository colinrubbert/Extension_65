/* globals IRX, LoggableClass */

(async (globals) => {

    const IFRAME_ID = 'IRX_bus';
    const RELAY = globals.RELAY;
    const IFRAME_LOAD_TIMEOUT_MS = 1000 * 8; // wait 8 seconds for iframe load before considering it timeout

    class FrameBridge extends LoggableClass {
        #remoteIframe;
        #parentRelayLevel;
        #parentDomain;
        #env;
        #frameId;
        #version;
        #isRemote;

        constructor(isRemote) {
            super(false);
            this.#isRemote = isRemote;

            this.log('Init at URL', globals?.location.href);

            this.#initFromHashData(globals?.location.hash);
            if(!this.#frameId){
                // generate a Frame ID if one wasn't passed in (will be in extension level)
                this.#frameId = new Date().getTime();
            }

            // NOTE -- the relay should be enabled by this point from the LOGGER
            // TODO -- update parentDomain
            this.log('Update relay to limit origin to ', this.#parentDomain);
        }

        #initFromHashData(hash) {
            // this page is loaded with bootstrapping info in the hash, encoded as json:
            // {   parentRelayLevel: parent relay level to notify when frame bridge is ready,
            //     origin: hash indicating the postMessage page to limit calls to (which is the parent page)
            // }

            let info;
            if (!hash) {
                this.log('No hash present on globals window!');
                throw new Error('No hash present on globals window!');
            }
            if (window.location.hash) {
                try {
                    info = JSON.parse(decodeURIComponent(window.location.hash.replace('#', '')));
                }catch (e) {
                    this.log('Error decoding bridgeInfo in extension page bus!', e.toString());
                    throw new Error(e);
                }
            }else{
                this.log('No hash data in bridge page!');
                throw new Error('Unable to continue, no hash data!');
            }
            if(!info.parentRelayLevel){
                throw new Error('No parent relay level in init hash!');
            }

            this.log('hash data', info);
            this.#parentRelayLevel = info.parentRelayLevel;
            if (info.env) this.#env = info.env;
            if (info.origin) this.#parentDomain = info.origin;
            if (info.frameId) this.#frameId = info.frameId;
            if (info.version) this.#version = info.version;
        }

        get frameId(){
            return this.#frameId;
        }

        get version(){
            return this.#version;
        }

        get env(){
            return this.#env;
        }

        markReady(){
            this.log('Frame bridge notify ready to', this.#parentRelayLevel);
            RELAY.send('loaded.FrameBridge', this.#parentRelayLevel);
        }

        async setupRemote(iframeUrl, env){
            if(env) this.#env = env;
            return new Promise(async (resolve, reject) => {
                let timedOut = false;
                const timeoutTmo = setTimeout(() => {
                    timedOut = true;
                    reject(`frameBridge didn't load within timeout period.: ${IFRAME_LOAD_TIMEOUT_MS}.`);
                }, IFRAME_LOAD_TIMEOUT_MS);

                this.log('Creating iframe', {url: iframeUrl, env: this.#env, frameId: this.#frameId});
                this.#remoteIframe = await this.constructor.createBridgeIframe(
                    iframeUrl,
                    this.#env,
                    '*',
                    this.#frameId
                );
                if(timedOut) return;

                clearTimeout(timeoutTmo);
                this.log('Iframe setup complete!');
                resolve();
            });
        }

        static getBridgeIframe(){
            return document.getElementById(IFRAME_ID);
        }

        static destroyBridgeIframe(){
            const iframe = this.getBridgeIframe();
            if(iframe) iframe.parentNode.removeChild(iframe);
        }

        static createBridgeIframe(iframeUrl, env, originOverride='*', frameId=null, version=null ){
            return new Promise((resolve, reject) => {
                const iframe = document.createElement('iframe');

                globals.RELAY.onOnce('loaded.FrameBridge', () => {
                    resolve(iframe);
                });

                iframe.setAttribute('id', IFRAME_ID);

                let bridgeInfo = {
                    env,
                    parentRelayLevel: globals.RELAY.curLevel(),
                    origin: originOverride || globals?.location?.origin
                };
                if(frameId) bridgeInfo.frameId = frameId;
                if(version) bridgeInfo.version = version;

                const infoEncoded = encodeURIComponent(JSON.stringify(bridgeInfo));

                let bridgeUrl = `${iframeUrl}#${infoEncoded}`;
                iframe.setAttribute('src', bridgeUrl);
                document.body.appendChild(iframe);
            });
        }
    }

    globals.FrameBridge = FrameBridge;

})(IRX);

