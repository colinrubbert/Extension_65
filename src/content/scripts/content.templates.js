/* globals IRX, LoggableClass */

(async (globals) => {

    class Templates extends LoggableClass {
        #templateCbListeners = {};

        constructor() {
            super(false);

            globals.RELAY.on('fetched.templates', this.#templateFetched.bind(this));
        }

        #templateFetched(data){
            const {name, template} = data;
            if(!(name in this.#templateCbListeners)) return;
            this.#templateCbListeners[name].forEach(cb => cb(template));
            delete this.#templateCbListeners[name];
        }

        build(name, data={}){
            this.log('Fetching template', name, data);
            return new Promise((resolve) => {
                if(!(name in this.#templateCbListeners)) this.#templateCbListeners[name] = [];
                this.#templateCbListeners[name].push(resolve);
                globals.RELAY.send('fetch.templates', globals.RELAY.levels.iframe_shim, {name, data});
            });
        }
    }

    globals.TEMPLATES = new Templates();

})(IRX);
