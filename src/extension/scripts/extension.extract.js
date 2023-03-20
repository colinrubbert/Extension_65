/* globals IRX, LoggableClass */

((globals) => {
    const CONTENT_SCRIPTS_DEF_FILE = 'content_script_definitions.json';
    const RELAY = globals.RELAY;

    class Extract extends LoggableClass {
        #contentScripts;

        constructor() {
            super(false);

            RELAY.on('requestInfoForPage.extract', async (data) => {
                const info = await this.#extractInfoForPage(data.url);
                this.log('requestInfoForPage', data.url, info);
                RELAY.send('returnInfoForPage.extract', RELAY.levels.content, {info, url: data.url});
            });
        }

        async #loadContentScriptDefinitions(){
            return new Promise(async (resolve, reject) => {
                let filesManifest = await fetch(globals.UTILS.extensionUrl(CONTENT_SCRIPTS_DEF_FILE));
                this.#contentScripts = (await filesManifest.json()).content_scripts.filter(def => '_extract' in def);
                this.log('loaded content script matches', this.#contentScripts);
                resolve();
            });
        }

        #extractInfoForPage(url){
            return new Promise(async (resolve) => {
                if (!this.#contentScripts) await this.#loadContentScriptDefinitions();

                let info = null;
                this.#contentScripts.some(definition => {
                    const re = new RegExp(definition._extract.match, 'ig');
                    const matched = re.test(url);
                    this.log('Check URL against re:', definition._extract, matched);
                    if (matched) {
                        info = definition._extract;
                        return true;
                    }
                    return false;
                });

                resolve(info);
            });
        }

        // NOTE only use this from the popup, not on the page
        extractEnabledOnCurrentPage(){
            return new Promise(async (resolve, reject) => {
                let tabs = await chrome.tabs.query({active: true, currentWindow: true});
                if(!tabs || !tabs.length || !tabs[0].url){
                    this.log('No tabs with URL matched!', tabs);
                    return resolve(false);
                }
                const url = tabs[0].url; // assume max of ONE since we have active/currentWindow true on query
                this.log('Current tab url', url);
                const extractInfo = await this.#extractInfoForPage(url);
                resolve(!!extractInfo);
            });
        }
    }

    globals.EXTRACT = new Extract();

})(IRX);
