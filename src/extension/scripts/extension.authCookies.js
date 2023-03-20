/* globals IRX */

((globals) => {

    const INDEED_COOKIES = Object.freeze({
        SOCK: 'SOCK',
        SHOE: 'SHOE',
        PCA: 'PCA'
    });
    // list of cookies needed ONLY for auth
    // NOTE -- this used to be just SOCK/SHOE, but we added PCA due to issues with advertiser detection in passthrough auth
    const REQUIRED_AUTH_COOKIES = [INDEED_COOKIES.SOCK, INDEED_COOKIES.SHOE, INDEED_COOKIES.PCA];

    const COOKIE_CHANGED_AT_REST_MS = 1000 * 3; // 3 second tolerance

    class AuthCookies extends globals.LoggableClass {
        #cookieDomain;
        #changeListeners = [];
        #callChangeCallbackTmo;

        constructor() {
            super(false, 'COOKIES');
            chrome.cookies.onChanged.addListener(this.#cookiesChanged.bind(this));
        }

        registerChangeListener(fn){
            this.#changeListeners.push(fn);
        }

        async #cookiesChanged(changeInfo){
            if(!(await this.#isAuthCookie(changeInfo.cookie))) return;

            // these cookie changes are sequential and can be rapid and only include a single cookie change
            // so what we're doing is constantly clearing then resetting a timeout to call the change callbacks
            // each time, which will finally execute when the changes are done and "at rest" for the tolerance time

            this.logNoStore('Auth cookie changed', changeInfo.cookie);
            if(this.#callChangeCallbackTmo) clearTimeout(this.#callChangeCallbackTmo);
            this.#callChangeCallbackTmo = setTimeout(this.#callRegisteredChangeHandlers.bind(this), COOKIE_CHANGED_AT_REST_MS);
        }

        #callRegisteredChangeHandlers(){
            this.logNoStore('Call registered change handlers');
            this.#changeListeners.forEach(cl => cl());
        }

        async #isAuthCookie(cookie){
            return cookie.domain.includes(await this.#getCookieDomain()) && cookie.name in INDEED_COOKIES;
        }

        async getCookies(){
            const allDomainCookies = await chrome.cookies.getAll({domain: await this.#getCookieDomain()});
            const filtered = allDomainCookies.filter(c => Object.values(INDEED_COOKIES).includes(c.name));
            this.logNoStore('getCookies', filtered);
            return filtered;
        }

        async currentlySetAuthCookieKeys(){
            return Object.keys(await this.getCookieValuesKeyed());
        }

        async areRequiredAuthCookiesSet(){
            const setCookies = await this.currentlySetAuthCookieKeys();
            const missing = REQUIRED_AUTH_COOKIES.filter(name => !setCookies.includes(name));
            return missing.length === 0;
        }

        async getCookieValue(name){
            if(!(name in INDEED_COOKIES)){
                throw new Error(`Invalid key requested for auth cookies! (${name})`);
            }
            return ((await this.getCookies()).find(cookie => cookie.name === name) || {}).value || null;
        }

        async getCookieValuesKeyed(){
            let obj = {};
            (await this.getCookies()).forEach( cookie => obj[cookie.name] = cookie.value);
            return obj;
        }

        async #getCookieDomain(){
            if(!this.#cookieDomain){
                const apiUrl = globals.ExtensionState.getApiInfoForEnv(await this.getEnv()).apiUrl;
                this.#cookieDomain = globals.UTILS.tldFromDomain(apiUrl);
            }
            return this.#cookieDomain;
        }

        async getAuthCookieHash(){
            let vals = await this.getCookieValuesKeyed();
            let hash = globals.UTILS.stringHashCyrb53(JSON.stringify(vals));
            this.logNoStore('getAuthCookieHash', vals, hash);
            return hash;
        }
    }


    globals.authCookies = new AuthCookies();

})(IRX);
