/* globals IRX, LoggableClass */

(async (globals) => {

    let _singleton;

    class Api extends LoggableClass {
        #apiUrl;
        #proxyHost;

        constructor(apiUrl, proxyHost) {
            super(false);
            this.#apiUrl = apiUrl;
            this.#proxyHost = proxyHost;
        }

        apiUrl(path) {
            return `${this.#apiUrl}${path}`;
        }

        get apiHeaders() {
            return {
                'accept': 'application/json',
                'content-type': 'application/json',
                'irx-proxy-host': this.#proxyHost
            };
        }

        call(path, method = 'GET', bodyParams = null, isJson = true) {
            // NOTES:
            // Currently this method makes the assumption of content-type JSON and accepts JSON
            // so bodyParams needs to be an object and expected response is JSON

            const headers = this.apiHeaders;
            const url = this.apiUrl(path);
            this.log(`Api call to ${url}`, headers, bodyParams);
            let fetchOpts = { headers, method, credentials: 'include', cache: 'no-store' };
            method = method.toUpperCase();
            if(bodyParams !== null && bodyParams.constructor === Object && ['GET', 'PUT', 'PATCH', 'POST'].includes(method)){
                fetchOpts.body = JSON.stringify(bodyParams);
            }
            // TODO when needed -- handle QUERY PARAMS! (currently assumes all calls are JSON body)
            // They can be supplied as-is on the path currently but we should have a param for em

            return new Promise(async (resolve, reject) => {
                try {
                    let response = await fetch(url, fetchOpts);
                    this.log(`Api call complete, status=${response.status}`);

                    if (!response.ok) {
                        this.log('Failed API call!', response.status);
                        return reject(response);
                    }

                    if (isJson) {
                        response = await response.json();
                    }
                    this.logNoStore('Response complete', response);
                    resolve(response);
                } catch (e) {
                    this.log('Error in API call', e.toString());
                    reject(e);
                }
            });
        }

        static async getApi(state, env){
            if(!_singleton){
                // NOTE stat is the state object in whatever context we're in (ExtensionState, ContentState, etc)
                const {apiUrl, proxyHost} = state.getApiInfoForEnv(env);
                _singleton = new this(apiUrl, proxyHost);
            }
            return _singleton;
        }
    }
    
    globals.Api = Api;
    
})(IRX);
