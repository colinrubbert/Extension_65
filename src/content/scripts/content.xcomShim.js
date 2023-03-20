/* globals IRX, LoggableClass */

((globals) => {

    const TEMPLATES = globals.TEMPLATES;
    const UI = globals.UI;
    const RELAY = globals.RELAY;

    const BODY_NOSCROLL_CLASS = 'irx_noscroll';

    class XcomShim  extends LoggableClass {
        #id;
        #metadata;
        #url;
        #errored = false;
        #errorCb;
        #doneCb;

        constructor(url, metadata){
            super(false);
            this.#id = (new Date().getTime());
            this.#metadata = metadata;
            this.#url = this.#addIdAndDataParams(url);

            this.#setupRelay();
        }

        #addIdAndDataParams(url){
            let urlParts = url.split('?', 2);
            let params = new URLSearchParams(urlParts.length > 1 ? urlParts.pop() : '');
            params.append('xcomId', this.#id);
            params.append('data', JSON.stringify(this.#metadata));
            return urlParts + '?' + params.toString();
        }

        #setupRelay(){
            RELAY.onOnce('exit.xcomShim', () => {
                this.log('exit.xcomShim');
                this.teardown();
            });
            RELAY.on('error.xcomShim', (data) => {
                this.#errored = true;
                this.log('Error in iframe shim', data.error);
                this.teardown(false);
                if(this.#errorCb) this.#errorCb(data.error);
            });
        }

        setup(){
            return new Promise(async (resolve) => {
                const templateData = {
                    id: this.#id,
                    url: this.#url,
                    data: JSON.stringify(this.#metadata)
                };
                const html = await TEMPLATES.build('xcom_shim', templateData);
                document.getElementsByTagName('body')[0].classList.add(BODY_NOSCROLL_CLASS);
                UI.fullpageUi(html);
                resolve();
            });
        }

        done(){
            return new Promise((resolve, reject) => {
                if(this.#errored) return reject();
                this.#errorCb = reject;
                this.#doneCb = resolve;
            });
        }

        teardown(isDone=true){
            document.getElementsByTagName('body')[0].classList.remove(BODY_NOSCROLL_CLASS);
            this.log(`teardown`);
            globals.RELAY.offAll('xcomShim');
            if(this.#doneCb && isDone){
                this.#doneCb();
                this.#doneCb = null;
            }
        }
    }
    globals.XcomShim = XcomShim;

})(IRX);
