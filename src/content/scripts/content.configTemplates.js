/* globals LoggableClass, IRX */

((globals) => {

    const RELAY = globals.RELAY;

    // PROXY definition to allow safe dot notation navigation to nested templated config values
    function proxiedObj (obj, debug, propPath = []){
        return new Proxy(obj, {
            get: (target, prop, receiver) => {

                if(!(prop in target)){
                    // list of reserved functions that are called regardless
                    if(globals.IS_DEV && !['then'].includes(prop)) {
                        throw new Error(`Config template nested property does not exist: ${prop}`);
                    }
                    return undefined;
                }
                const next = target[prop];

                if(next && typeof next === 'object'){
                    return proxiedObj(next, debug, [...propPath].concat(prop));
                }else{
                    if(debug){
                        // NOTE -- one-off handling of logger here, vs normal class extension due to Proxy
                        console.log('::configTemplate::', propPath.concat(prop).join('.'), next);
                    }
                    return next;
                }
            }
        });
    }

    class ConfigTemplates extends LoggableClass {
        #cache = {};

        constructor() {
            super(false);
        }

        get(name, debug=false){
            this.log('Fetch template', name);
            return new Promise((resolve, reject) => {
                if (name in this.#cache){
                    this.log('In cache, no need to fetch', name);
                    return resolve(this.#cache[name]);
                }

                // NOTE -- this is assuming these will be fetched linearly!
                // If we need to change that ever we'll have to bind val specific callbacks
                RELAY.onOnce('getReturn.configTemplates', async (data) => {
                    if(data === null){
                        return reject('Unable to load template');
                    }

                    this.log('Fetch returned', name, JSON.stringify(data));
                    const pObj = proxiedObj(JSON.parse(JSON.stringify(data)), debug || this._logging.debug);

                    this.#cache[name] = pObj;
                    resolve(pObj);
                });

                RELAY.send('get.configTemplates', RELAY.levels.iframe, {name});
            });
        }
    }

    globals.configTemplates = new ConfigTemplates;

})(IRX);
