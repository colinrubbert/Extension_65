/* globals IRX, PageFeatureBaseClass */

(async (globals) => {

    const TEMPLATES = globals.TEMPLATES;
    const SELECTOR_ID = 'irx_inline_extract_button';
    const API_PUSH_BTN_ID = 'irx_connected_push_extract_button';
    const EXTRACT_BTN_ID = 'irx_inline_extract_btn';
    const CUSTOM_STYLE_ELEM_ID = 'irx_button_custom_style_rule';
    const EXTRACT = globals.Extract;
    const UI_DRAW_CHECK_INTERVAL = 500; // 500 ms debounce for mutationObserver checks
    const $ = globals.$;

    class PageButtons extends PageFeatureBaseClass {
        #pageExtractInfo;
        #wasIndividualResume = false;
        #integrations = [];
        #reminders = [];

        constructor(integrations, reminders, configTemplate) {
            super('extract_button', false, UI_DRAW_CHECK_INTERVAL, configTemplate);
            this.logNoStore('initialized with reminders', globals.UTILS.cloneObject(reminders));
            this._init(integrations, reminders);
        }

        get connectedSystemInfo() {
            let response = {show: false, disabled: false, label: 'Connected Systems'};
            if (!this.#integrations.length) return response;
            response.show = true;

            if (this.#integrations.length === 1) {
                if (this.#integrations[0].lastPausedAt) {
                    response.label = this.#integrations[0].label + ' (Paused) ';
                    response.disabled = true;
                } else {
                    response.label = 'Push to ' + this.#integrations[0].label;
                }
            }
            return response;
        }

        #determinePageSupport(){
            return new Promise(async (resolve) => {
                let info = {
                    insertFn: null,
                    wrapSel: null,          // selector for wrap to insert button group into
                    buttonStyle: '',        // extra css class to apply to the button group
                    updateFn: null,         // optional fn that takes in $wrap to do stuff with after draw
                    forceRedraw: false,
                    testFn: null,
                    customCssRule: null
                };

                const pageExtractInfo = await EXTRACT.determineExtractPageType(window.location.href);
                this.#pageExtractInfo = pageExtractInfo;
                this.log('pageExtractInfo', pageExtractInfo);

                if(!pageExtractInfo || !pageExtractInfo.info) return resolve(null);

                const {type, page} = pageExtractInfo.info;
                const isHosted = type === EXTRACT.types.hosted;
                const isResume = type === EXTRACT.types.resume;
                
                const CT = this._configTemplate.buttons;

                if(isHosted){
                    if(page === EXTRACT.pages.candidateViewPage){
                        // candidate individual view page in hosted jobs
                        info.wrapSel = CT.hosted.candidateViewPage.wrapSel;
                        info.buttonStyle = CT.hosted.candidateViewPage.style;

                    }else if(page === EXTRACT.pages.employerCandidateList) {
                        // New OneHost UI for hosted jobs candidate list
                        info.wrapSel = CT.hosted.employerCandidateList.wrapSel;
                        info.buttonStyle = CT.hosted.employerCandidateList.style;
                        info.insertFn = ($wrap, html) => {
                            $wrap.nextAll(CT.hosted.employerCandidateList.insertFn.nextAll)
                                .find(CT.hosted.employerCandidateList.insertFn.find)
                                .before(CT.hosted.employerCandidateList.insertFn.before.replace('{{HTML}}', html));
                        };
                    }
                }

                if(isResume){
                    if(page === EXTRACT.pages.individualResume){
                        info.wrapSel = 'todo';
                        info.buttonStyle = 'todo';

                    }else if(page === EXTRACT.pages.projectPage){
                        // projects 'interested' or 'email response' views

                        // CT.projectPage.individual.selectorSel
                        if ($(CT.projectPage.individual.selectorSel).length) {
                            // individual resume shown
                            if(!this.#wasIndividualResume) info.forceRedraw = true;
                            this.#wasIndividualResume = true;

                            // CT.projectPage.individual.wrapSel
                            info.wrapSel = CT.projectPage.individual.wrapSel;
                            info.buttonStyle = CT.projectPage.individual.style;
                            info.testFn = () => {
                                return $(CT.projectPage.individual.testInterestedFnSel).length;
                            };
                        }else{
                            this.#wasIndividualResume = false;
                            info.wrapSel = CT.projectPage.list.wrapSel;
                            info.buttonStyle = CT.projectPage.list.style;
                            $(CT.projectPage.list.parentSel).closest(CT.projectPage.list.parentClosestSel).addClass(CT.projectPage.list.customParentClass);
                            info.customCssRule = CT.projectPage.list.customParentRule;
                            info.testFn = () => {
                                const filterParam = globals.UTILS.getQueryParam('filter') || '';
                                const fromParam = globals.UTILS.getQueryParam('from') || '';
                                return ['interested','replied'].includes(filterParam) || fromParam.startsWith('interested.email');
                            };
                        }
                    }
                }

                resolve(info);
            });
        }

        async _uiChange() {
            this.log('uiChange');
            //if (data_loaded && !force) return;

            const buttonInfo = await this.#determinePageSupport();
            this.logNoStore('button info result', buttonInfo);


            const $existing = $(`#${SELECTOR_ID}`);
            const wasExisting = $existing.length;
            if(!buttonInfo){
                if($existing.length) this._cleanupUi();
                return this.logNoStore('Removing existing button and returning.');
            }

            if(buttonInfo.testFn && !buttonInfo.testFn()){
                if($existing.length) this._cleanupUi();
                return this.log('No draw, did not pass test function');
            }

            if($existing.length){
                if(buttonInfo.forceRedraw){
                    this._cleanupUi();
                }else{
                    return this.logNoStore('Button exists, not drawing again');
                }
            }

            if(!$(buttonInfo.wrapSel).length){
                return this.log('No draw, wrapSel missing!');
            }

            const csInfo = this.connectedSystemInfo;

            if(buttonInfo.customCssRule){
                this.#addCustomCssStyleToPage(buttonInfo.customCssRule);
            }

            const buttonId = Date.now();
            const templateData = {
                buttonId,
                pushLabel: csInfo.label,
                showApiButton: csInfo.show,
                id: SELECTOR_ID,
                buttonStyle: buttonInfo.buttonStyle,
                disabled: csInfo.disabled
            };

            const html = await TEMPLATES.build('extract_button', templateData);
            this.logNoStore('Add HTML', html);

            // Verify wrap is still there
            const $wrap = $(buttonInfo.wrapSel);
            if (!$wrap.length) return this.logNoStore('Wrap missing after template generation, not inserting button');
            if(buttonInfo.insertFn){
                buttonInfo.insertFn($wrap, html);
            }else {
                $wrap.append(html);
            }
            if (buttonInfo.updateFn) buttonInfo.updateFn($wrap);
            this.#drawReminder();

            if(!wasExisting){
                const {type, page} = this.#pageExtractInfo.info;
                this.markUiImpression(buttonId, 'create_button', 'indeed', type, page);
            }
        }

        async #drawReminder(){
            const {type, page} = this.#pageExtractInfo.info;

            const reminderKey = `${type}_${page}`;
            this.log('Checking reminder key to draw reminder for', reminderKey, this.#reminders[reminderKey]);
            if(this.#reminders[reminderKey]) return this.log('not showing reminder, already seen');

            const html = await TEMPLATES.build('extract_getting_started');
            globals.UI.modal(html);

            this.#reminders[reminderKey] = true;
            globals.RELAY.localSend('markReminderSeen.state', {keys: [reminderKey]});
        }

        _cleanupUi(){
            const $existing = $('#' + SELECTOR_ID);
            if ($existing.length) $existing.remove();
        }
        
        _init(integrations, reminders){
            if(!this._shouldInitialize) return;
            this.reset(integrations, reminders);
        }

        reset(integrations, reminders){
            this.#integrations = integrations || [];
            this.#reminders = reminders;
            super.reset();
        }

        #startExtract(buttonId, toConnectedSystem=false){
            this.log(`Initialize extract - (for connected system push? ${toConnectedSystem ? 'true' : 'false'})`);
            const {type, page} = this.#pageExtractInfo.info;
            this.markUiButtonClick(buttonId, 'extract', 'indeed', type, page);
            globals.RELAY.localSend('start.extract', {toConnectedSystem});
        }

        _bindEvents(){
            $(document.body).on('click.irx', `#${SELECTOR_ID} #${EXTRACT_BTN_ID}`, (e) => {
                if(globals.CONTENT_UTILS.isOrphaned) return;
                e.stopImmediatePropagation();
                const buttonId = $(e.target).data('irx-id');
                this.#startExtract(buttonId);
            }).on('click.irx', `#${SELECTOR_ID} #${API_PUSH_BTN_ID}`, (e) => {
                if(globals.CONTENT_UTILS.isOrphaned) return;
                e.stopImmediatePropagation();
                const buttonId = $(e.target).data('irx-id');
                this.#startExtract(buttonId,true);
            });
        }

        #addCustomCssStyleToPage(cssRule){
            const oldElem = document.getElementById(CUSTOM_STYLE_ELEM_ID);
            oldElem?.remove();

            let style = document.createElement('style');
            style.setAttribute('id', CUSTOM_STYLE_ELEM_ID);
            document.getElementsByTagName('head')[0].appendChild(style);
            style.sheet.insertRule(cssRule);
        }

    }

    globals.PageButtons = PageButtons;

})(IRX);
