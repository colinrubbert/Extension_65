/* globals PageFeatureBaseClass, IRX */

(async (globals) => {

    const RELAY = globals.RELAY;
    const UI = globals.UI;
    const GENERIC_ERROR_MESSAGE = 'There was an issue loading the needed extraction information. Please try again.';
    const PAGE_EXTRACT_MANIFEST_DEPENDENCIES = ['page_primary_bundle', 'page_extract_bundle'];
    const $ = globals.$;

    let _pageAdvertiserKey;
    let _pageScriptsInjected;

    // TODO -- make these dynamically generated from content_script_definitions.json if possible
    const EXTRACT_TYPES = Object.freeze({ hosted: 'hosted', resume: 'resume' });
    const EXTRACT_PAGES = Object.freeze({
        candidateViewPage: 'candidateViewPage',
        employerCandidateList: 'employerCandidateList',
        individualResume: 'individualResume',
        projectPage: 'projectPage'
    });

    class Extract extends PageFeatureBaseClass {
        #advertiserKey;
        #toConnectedSystem = false;
        #xcom;

        constructor(advertiserKey, configTemplate) {
            super('extract', false, null, configTemplate);
            this.#advertiserKey = advertiserKey;
            this._init();
        }

        _bindMessageListeners(){
            RELAY.on('start.extract', this.#startExtract.bind(this));
            RELAY.on('clipSaved.extract', data => {
                this._clearApiCallTimer();
                this.#showPostExtract(data.batchId);
            });
            RELAY.on('errors.extract', data => {
                this._clearApiCallTimer();
                this._error(data.errors);
            });

            // NOTE -- maybe this flow of binding onMessage can get moved to pageFeatureBaseClass ??
            globals.CONTENT_UTILS.bindChromeEventListener(chrome.runtime.onMessage, this.#onMessage, this);
        }

        _cleanupMessageListeners(){
            RELAY.offAll('extract');
            // NOTE -- maybe this flow of binding onMessage can get moved to pageFeatureBaseClass ??
            globals.CONTENT_UTILS.unbindChromeEventListener(chrome.runtime.onMessage, this.#onMessage);
        }

        _init(){
            if(!this._shouldInitialize) return;
            this.reset();
        }

        async #onMessage(msg){
            if(msg === 'popup.extract'){
                this.#startExtract({toConnectedSystem: false});
                return Promise.resolve();
            }
        }

        #showPostExtract(batchId){
            this.log('Show post extract', batchId);
            // NOTE this is only called after single-record extract, it's redirected to in dashboard for multi record
            const failureMessage = 'Your record was extracted but there was an error displaying it. Please view it in your IRX clipboard.';
            this.#doXcom(`/hosted-jobs-extract/iframe-modal/post-extract/batch/${batchId}`, this.#buildXcomMeta(), failureMessage);
        }

        async #doXcom(url, metadata, failureMessage=GENERIC_ERROR_MESSAGE){
            this.#xcom = new globals.XcomShim(url, metadata);

            await this.#xcom.setup();

            try {
                await this.#xcom.done();
                UI.close();
            } catch(e) {
                console.error(e);
                this.log('Error creating/comming with xcom!', e.toString());
                UI.error(failureMessage);
            }
            this.#xcom = null;
        }

        async #startExtract(data){
            const {toConnectedSystem} = data;
            this.#toConnectedSystem = toConnectedSystem;

            let pageExtractInfo;
            try{
                pageExtractInfo = await this.constructor.determineExtractPageType(window.location.href);
                if(!pageExtractInfo) throw new Error('Empty pageExtractInfo');
            }catch(e){
                this.log('Unale to get pageExtractInfo', e);
                return UI.error(GENERIC_ERROR_MESSAGE);
            }

            const {type, page, subsource} = pageExtractInfo.info;
            const isHosted = type === EXTRACT_TYPES.hosted;
            const isResume = type === EXTRACT_TYPES.resume;

            if(isResume){
                const CT = this._configTemplate.extract.resume;

                if(page === EXTRACT_PAGES.individualResume){
                    this.log('Individual resume page detected.');
                    const resumeKey = window.location.pathname.split('/').pop();
                    this.log('Resume key from URL', resumeKey);
                    if(!resumeKey){
                        this.log('Error extracting resumeKey from url!');
                        return UI.genericError();
                    }

                    const interested = !!$(CT.individualResume.interestedSel).length;

                    this.log('Contact is interested?', interested);
                    if(!interested) return UI.error('Only interested contacts can be extracted.');

                    const fullName = $(CT.individualResume.fullNameSel).text();
                    return this.#saveIndividualClip(subsource, {
                        indeed_resume_account_key: resumeKey,
                        full_name: fullName
                    });
                    
                }else if(page === EXTRACT_PAGES.projectPage){

                    // determine if we have an individual resume open on the project page or are just looking at the list
                    if(window.location.pathname.includes('/jobseekers/')){
                        this.log('Resume projects page, individual resume view');
                        const resumeKey = window.location.pathname.split('/jobseekers/').pop();
                        this.log('Resume account key from URL', resumeKey);
                        if(!resumeKey){
                            this.log('Error extracting resumeKey from url!');
                            return UI.genericError();
                        }

                        const interested = !!$(CT.projectPage.individual.interestedSel).length;
                        this.log('Contact is interested?', interested);
                        if(!interested) return UI.error('Only interested contacts can be extracted.');

                        const fullName = $(CT.projectPage.individual.fullnameSel).text();
                        return this.#saveIndividualClip(subsource, {
                            indeed_resume_account_key: resumeKey,
                            full_name: fullName
                        });
                    }

                    this.log('Resume projects page, list view');

                    const projectKey = window.location.pathname.split('/').filter(v => !!v).pop();
                    this.log('Project key from URL', projectKey);
                    if(!projectKey){
                        this.log('Error detecting project key from URL!');
                        return UI.genericError();
                    }

                    const url = '/resume-extract/iframe-modal/form';
                    const metadata = {
                        project_key: projectKey,
                        advertiser_key: this.#advertiserKey
                    };
                    this.#doXcom(url, this.#buildXcomMeta(metadata));
                }

            }else if(isHosted){
                if(page === EXTRACT_PAGES.candidateViewPage) {
                    this.log('Hosted candidate view individual page detected');
                    const candidateKey = globals.UTILS.getQueryParam('id') || globals.UTILS.getQueryParam('id', window.location.hash);
                    if(!candidateKey){
                        this.log('Error detecting candidate key from URL!');
                        return UI.genericError();
                    }

                    return this.#saveIndividualClip(subsource, {
                        indeed_hosted_candidate_key: candidateKey
                    });
                }else if(page === EXTRACT_PAGES.employerCandidateList) {
                    this.log('Hosted candidate list page');
                    let jobKey = globals.UTILS.getQueryParam('id') || globals.UTILS.getQueryParam('id', window.location.hash);

                    // There's a weird edge case where if you're on a specific job ID, then switch advertiser it defaults the UI view to
                    // all open/paused but the old jobId is still in the query params, which breaks the extraction. This double checks to
                    // see if we think this is a specific job, that the UI is *not* on all open/paused
                    const isAllOpenPausedInUi = $(this._configTemplate.extract.hosted.openAndPausedSel).length !== 0;
                    this.log('Job key from URL', jobKey);
                    this.logNoStore('Is open paused in UI?', isAllOpenPausedInUi);
                    if(isAllOpenPausedInUi && jobKey !== '0'){
                        // EDGE CASE -- fix it so it's all open/paused
                        jobKey = '0';
                        this.log('Edge case detected, switching to all open/paused job key!');
                    }

                    if(!jobKey){
                        this.log('Error detecting job key from URL!');
                        return UI.genericError();
                    }

                    const url = '/hosted-jobs-extract/iframe-modal/form';
                    const metadata = {
                        hosted_job_id: jobKey,
                        advertiser_key: this.#advertiserKey,
                        status_name: globals.UTILS.getQueryParam('statusName'),
                    };
                    this.#doXcom(url, this.#buildXcomMeta(metadata));
                }
            }
        }

        #buildXcomMeta(obj = {}){
            let meta = {};
            Object.assign(meta, obj);
            Object.assign(meta, {
                pushDirectlyToIntegrations: this.#toConnectedSystem,
                extensionManifestVersion: 3
            });
            return meta;
        }

        #saveIndividualClip(subsource, data){
            const clipData = {
                subsource,
                data
            };
            this.logNoStore('Generated clip data', clipData);

            UI.loading('Saving record.');
            this._setApiCallTimer();

            RELAY.send('saveClip.extract', RELAY.levels.iframe, {clipData});
        }

        static async #loadPageScripts(){
            if (!_pageScriptsInjected) {
                const origin = 'chrome-extension://kiodpphbmnmcmnfgpnmkkhmkllnlflef/';
                await globals.UTILS.loadScriptDependencies(origin, PAGE_EXTRACT_MANIFEST_DEPENDENCIES);
                _pageScriptsInjected = true;
            }
        }

        static getCurrentPageAdvertiserKey(){
            return new Promise(async (resolve, reject) => {
                try {
                    await this.#loadPageScripts();

                    _pageAdvertiserKey = _pageAdvertiserKey || (await globals.UTILS.relayOnOnceAwait(
                        'requestAdvertiserKey.extract', RELAY.levels.page, null,
                        'returnAdvertiserKey.extract'
                    )).advertiserKey;

                    if (!_pageAdvertiserKey) throw new Error('Empty _pageAdvertiserKey');
                }catch(e){
                    return reject(e);
                }

                resolve(_pageAdvertiserKey);
            });
        }

        static determineExtractPageType(url) {
            return new Promise(async (resolve, reject) => {
                let supportInfo;

                try {
                    supportInfo = await globals.UTILS.relayOnOnceAwait(
                        'requestInfoForPage.extract', RELAY.levels.iframe_shim, {url},
                        'returnInfoForPage.extract');

                    if(!supportInfo) throw new Error('Empty supportInfo');

                }catch(e){
                    return reject(e);
                }
                resolve(supportInfo);
            });
        }

        static get types() {
            return EXTRACT_TYPES;
        }

        static get pages() {
            return EXTRACT_PAGES;
        }
    }

    globals.Extract = Extract;

})(IRX);
