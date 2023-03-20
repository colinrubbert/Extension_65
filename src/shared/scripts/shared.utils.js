/* globals IRX */

((globals) => {

    const promiseRetry = (fn, retriesLeft = 5, interval = 1000) => {
        return new Promise(async (resolve, reject) => {
            try{
                const response = await fn();
                resolve(response);
            }catch(e){
                if (!retriesLeft) return reject(e);
                setTimeout(() => {
                    promiseRetry(fn, retriesLeft - 1, interval)
                        .then(resolve, reject);
                }, interval);
            }
        });
    };

    const getJsonRetry = (path, retriesLeft = 5, interval = 1000) => {
        const fn = () => {
            return new Promise(async (resolve, reject) => {
                try {
                    const response = await fetch(path, {cache: 'no-store'});
                    if (!response.ok) throw new Error('Invalid status!');
                    resolve(await response.json());
                }catch(e){
                    reject(e);
                }
            });
        };
        return promiseRetry(fn, retriesLeft, interval);
    };

    const debounce = (func, timeout = 300) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => { func.apply(this, args); }, timeout);
        };
    };

    const getQueryParam = (key, str = window.location.search) => {
        // Can pass in a search string, full URL
        const searchStr = str.split('?').pop();
        const params = new URLSearchParams(searchStr);
        return params.get(key);
    };

    const appendQueryParamToUrl = (url, key, val) => {
        return url + (url.includes('?') ? '&' : '?') + encodeURIComponent(key) + '=' + encodeURIComponent(val);
    };

    const isQueryParamPresent = (key, str=window.location.search) => {
        return getQueryParam(key, str) !== null;
    };

    const generateGuid = () => {
        // https://stackoverflow.com/questions/105034/how-do-i-create-a-guid-uuid
        let h=['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];
        let k=['x','x','x','x','x','x','x','x','-','x','x','x','x','-','4','x','x','x','-','y','x','x','x','-','x','x','x','x','x','x','x','x','x','x','x','x'];
        let u='',i=0,rb=Math.random()*0xffffffff|0;
        while(i++<36) {
            let c=k[i-1],r=rb&0xf,v=c=='x'?r:(r&0x3|0x8);
            u+=(c=='-'||c=='4')?c:h[v];rb=i%8==0?Math.random()*0xffffffff|0:rb>>4;
        }
        return u;
    };

    const cloneObject = (obj) => {
        return JSON.parse(JSON.stringify(obj));
    };

    const semverEqualOrGreater = (test, required) => {
        // 0: version strings are equal, 1: version test is greater than required, -1: version required is greater than test
        const result = test.localeCompare(required, undefined, { numeric: true, sensitivity: 'base' });
        return result === 0 || result === 1;
    };

    const extensionUrl = (path) => {
        return `chrome-extension://${chrome.runtime.id}/${path}`;
    };

    const stringHashCyrb53 = (str, seed = 0) => {
        // https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
        let h1 = 0xdeadbeef ^ seed,
            h2 = 0x41c6ce57 ^ seed;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }

        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

        return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    };

    const tldFromDomain = (domain) => {
        const url = new URL(domain);
        return url.host.split('.').slice(-2).join('.').split(':')[0];
    };

    const sortObjectByKeysAlpha = (groups) => {
        return Object.keys(groups).sort((a,b) => {
            return a.localeCompare(b);
        }).reduce(
            (obj, key) => {
                obj[key] = groups[key];
                return obj;
            },
            {}
        );
    };

    const relayOnOnceAwait = async(sendOnceMsg, sendOnceLevel, sendOnceData, responseOnceMsg) => {
        return new Promise((resolve, _reject) => {
            globals.RELAY.onOnce(responseOnceMsg, resolve);
            globals.RELAY.send(sendOnceMsg, sendOnceLevel, sendOnceData);
        });
    };

    const loadScriptDependencies = async (origin, dependencies, loadTimeoutSeconds = 8) => {
        return new Promise(async (resolve, reject) => {
            // NOTE -- this only works in extension iframe, core iframe, in content script (which loads deps into global namespace)
            const manifest = await(await fetch(origin + 'files.manifest.json')).json();
            for (const manifestKey of dependencies) {
                if (!(manifestKey in manifest)) throw new Error(`Manifest key "${manifestKey}" not present in file manifest!`);
                for (const filePath of manifest[manifestKey]) {
                    try {
                        await new Promise((resolve, reject) => {
                            let timedOut = false;
                            const scriptSrc = `${origin}${filePath}`;

                            const loadTmo = setTimeout(() => {
                                timedOut = true;
                                reject(`Timeout loading script ${scriptSrc} in ${loadTimeoutSeconds} seconds.`);
                            }, (loadTimeoutSeconds * 1000));

                            const script = document.createElement('script');
                            script.onload = () => {
                                if (timedOut) return;
                                clearTimeout(loadTmo);
                                resolve();
                            };
                            script.src = scriptSrc;
                            document.body.appendChild(script);
                        });
                    }catch(e){
                        reject(e);
                    }
                }
            }
            resolve();
        });
    };

    globals.UTILS = {
        relayOnOnceAwait,
        promiseRetry,
        getJsonRetry,
        debounce,
        getQueryParam,
        appendQueryParamToUrl,
        isQueryParamPresent,
        generateGuid,
        cloneObject,
        semverEqualOrGreater,
        extensionUrl,
        stringHashCyrb53,
        tldFromDomain,
        sortObjectByKeysAlpha,
        loadScriptDependencies
    };

})(IRX);
