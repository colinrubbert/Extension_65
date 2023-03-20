/* globals IRX, PageFeatureBaseClass */

(async (globals) => {

    const TEMPLATES = globals.TEMPLATES;
    const RELAY = globals.RELAY;
    const UI = globals.UI;
    const UI_DRAW_CHECK_INTERVAL = 100; // 100 ms debounce for mutationObserver checks
    const $ = globals.$;

    const CREATE_BUTTON_ID = 'zapinfo_create_interview_button',
        DELETE_BUTTON_ID = 'zapinfo_delete_interview_button',
        JOIN_BUTTON_ID = 'zapinfo_join_interview_button',
        CSS_DISABLED_CLASS = 'zi_disabled';

    class Interview extends PageFeatureBaseClass {
        #pageInfoInstance;
        #pageInfo = null;

        constructor(showReminder, configTemplate) {
            super('interview', false, UI_DRAW_CHECK_INTERVAL, configTemplate);
            this._init(showReminder);
        }

        #getInfoForPage() {
            let pageInfo;
            if (this.#pageInfoInstance) {
                this.#pageInfoInstance.update();
            } else {
                if (globals.GCalInterviewSite.matchesUrl()) {
                    this.#pageInfoInstance = new globals.GCalInterviewSite(this._configTemplate);
                }
            }

            if (this.#pageInfoInstance) {
                pageInfo = this.#pageInfoInstance.pageInfo;

                if (pageInfo.$parent && pageInfo.$parent.length) {
                    // search $parent.html() to see if we can find an interview URL
                    const interviewUrlMatch = pageInfo.$parent[0].innerHTML.match(this.#pageInfoInstance.INTERVIEW_URL_MATCH_RE);
                    if (interviewUrlMatch && interviewUrlMatch.length) {
                        pageInfo.interviewUrl = interviewUrlMatch[0];
                    }
                }

                if (pageInfo.interviewUrl) {
                    pageInfo.showJoinButton = this.#pageInfoInstance.showJoinButton(pageInfo.interviewUrl);
                }
            }

            this.logNoStore('Info Results', pageInfo);
            return pageInfo;
        }

        // remove any existing interview buttons
        #removeExisting(explicitId) {
            let ids = `#${CREATE_BUTTON_ID}, #${JOIN_BUTTON_ID}`;
            if (explicitId) ids = `#${explicitId}, #${explicitId}_row`;
            $(ids).remove();
        }

        // function called each interval to draw the button if needed
        async _uiChange() {
            this.#pageInfo = this.#getInfoForPage();
            const pgInfo = this.#pageInfo;

            let $existingCreateBtn = $('#' + CREATE_BUTTON_ID);
            let $existingJoinBtn = $('#' + JOIN_BUTTON_ID);
            this.log('DRAW INTERVAL', $existingCreateBtn, $existingJoinBtn);

            if (!pgInfo || !pgInfo.$parent) {
                this.#removeExisting();
                return this.log('No draw, wrapper not present');
            }


            this.log(`showCreateButton/Row: ${pgInfo.showCreateButton?'1':'0'} ${pgInfo.showCreateButtonRow?'1':'0'}`, pgInfo.interviewUrl);
            if ((pgInfo.showCreateButton || pgInfo.showCreateButtonRow) && !pgInfo.interviewUrl) {
                if (!$existingCreateBtn.length) {
                    const buttonId = Date.now();
                    const tdata = {
                        cssClass: pgInfo.cssClass,
                        iconUrl: globals.UTILS.extensionUrl('images/indeed_i_blue.svg'),
                        videoIconUrl: globals.UTILS.extensionUrl('images/video_icon.svg'),
                        id: CREATE_BUTTON_ID,
                        disabled: !!pgInfo.interviewUrl,
                        cssDisabledClass: CSS_DISABLED_CLASS,
                        meta: pgInfo.createButtonMeta,
                        buttonId
                    };

                    const html = await TEMPLATES.build(`create_interview_button${pgInfo.showCreateButtonRow ? '_row' : ''}`, tdata);
                    this.log('Add Create btn HTML', html);
                    // verify parent is still there ?
                    this.#removeExisting(CREATE_BUTTON_ID);
                    pgInfo.createBtnInsertFn(html);
                    this.markUiImpression(buttonId, 'create_button', pgInfo.pageType, 'calendar');

                } else {
                    if (pgInfo.interviewUrl) this.#removeExisting(CREATE_BUTTON_ID);
                }
            } else {
                if ($existingCreateBtn.length) this.#removeExisting(CREATE_BUTTON_ID);
            }


            if (!$existingJoinBtn.length && pgInfo.interviewUrl && pgInfo.showJoinButton) {
                const buttonId = globals.UTILS.stringHashCyrb53(pgInfo.interviewUrl);
                const tdata = {
                    buttonId,
                    cssClass: pgInfo.cssClass,
                    indeedIconUrl: globals.UTILS.extensionUrl('images/indeed_i.svg'),
                    videoIconUrl: globals.UTILS.extensionUrl('images/video_icon.svg'),
                    id: JOIN_BUTTON_ID,
                    showDeleteButton: pgInfo.showDeleteButton,
                    interviewUrl: pgInfo.interviewUrl,
                    interviewGuid: this.#guidFromInterviewUrl(pgInfo.interviewUrl)
                };

                const html = await TEMPLATES.build('join_interview_button', tdata);
                this.log('Add Join btn HTML', html);
                // verify parent is still there ?
                this.#removeExisting(JOIN_BUTTON_ID);
                pgInfo.joinBtnInsertFn(html);
                this.markUiImpression(buttonId, 'join_button', pgInfo.pageType, 'calendar');
            }
        }

        #guidFromInterviewUrl(url) {
            const matches = /([0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12})/i.exec(url);
            return matches[0];
        }

        async #createInterview() {
            let interviewInfo = this.#pageInfo.getInterviewInfoFn();
            this.log('Info for interview', interviewInfo);

            let errors = [];
            if (!interviewInfo.timezone || !interviewInfo.gmtOffset) {
                this.log('Missing timezone or gmtOffset!');
                errors.push('Unable to load your timezone -- please contact support.');
            }
            if (!interviewInfo.date) {
                this.log('Missing date for info!');
                errors.push('Unable to read date or time -- please contact support.');
            }
            if (!interviewInfo.year) {
                this.log('Missing year for info!');
                errors.push('Unable to read date or time -- please contact support.');
            }
            if (interviewInfo.addTimeButtonExists === true) { // In monthly view a Time must be added to the event.
                this.log('Missing start and end time info!');
                errors.push('You must add a time for the Interview.');
            } else {
                if (!interviewInfo.startTime) {
                    this.log('Missing startTime for info!');
                    errors.push('Unable to read date or time -- please contact support.');
                }
                if (!interviewInfo.endTime) {
                    this.log('Missing endTime for info!');
                    errors.push('Unable to read date or time -- please contact support.');
                }
            }

            if (!interviewInfo.title) {
                this.log('Missing title for info!');
                errors.push('You must fill out the event title for the Interview');
            }
            if (errors.length) return this._error(errors);

            UI.loading('Generating Interview link');
            interviewInfo.language = navigator.language;
            this._setApiCallTimer();

            RELAY.send('generate.interview', RELAY.levels.iframe,
                {info: interviewInfo, pageType: this.#pageInfo.pageType});
        }

        #deleteInterview(guid) {
            UI.loading('Deleting interview');
            this.log('Delete interview by guid', guid);
            RELAY.send('delete.interview', RELAY.levels.iframe, {guid, pageType: this.#pageInfo.pageType});
        }

        _bindEvents() {
            $(document.body).on('click.zapinfo', `#${CREATE_BUTTON_ID}`, (e) => {
                if(globals.CONTENT_UTILS.isOrphaned) return;
                e.stopImmediatePropagation();
                e.preventDefault();
                if ($(e.target).closest(`#${CREATE_BUTTON_ID}`).hasClass(CSS_DISABLED_CLASS)) return;
                this.#createInterview();
            }).on('click.zapinfo', `#${DELETE_BUTTON_ID}`, (e) => {
                if(globals.CONTENT_UTILS.isOrphaned) return;
                e.stopImmediatePropagation();
                e.preventDefault();
                this.#deleteInterview($(e.target).closest(`#${JOIN_BUTTON_ID}`).data('guid'));
            }).on('click.zapinfo', `#${JOIN_BUTTON_ID} .indeed_interview_join_btn`, (e) => {
                if(globals.CONTENT_UTILS.isOrphaned) return;
                const btnId = $(e.target).data('irx-id');
                this.markUiButtonClick(btnId, 'join', this.#pageInfo.pageType, 'calendar');
            });
        }

        _cleanupUi() {
            let $existing = $('#' + CREATE_BUTTON_ID);
            if ($existing.length) $existing.remove();
        }

        async #interviewGenerated(data){
            this._clearApiCallTimer();

            const html = await TEMPLATES.build('interview_body_text', data);

            this.log('Interview body text generated:', html);
            const backupText = [`Candidate URL: ${data.candidate_short_url}\n`,
                `Interviewer URL: ${data.lobby_url}\n`].join('\n');
            this.#pageInfo.setInterviewBodyTextFn(html, (descriptionUpdated) => {
                if (!descriptionUpdated) {
                    RELAY.localSend('copy.clipboard', {value: backupText});
                }
                let msg1 = 'Interview created on Indeed. ';
                msg1 += 'Note that the start time & date of this interview does not update on Indeed if you update this cal invite, ';
                msg1 += 'and must be updated manually on Indeed.' + '\n\n';
                let notifications = [msg1];
                if (descriptionUpdated) {
                    notifications.push('Access URLs have been copied to the cal description, please save the cal invite.');
                } else {
                    notifications.push('We were unable to insert interview URLs into event description, and they have been copied to your clipboard');
                }
                this._notification(notifications);
            });
        }

        #interviewDeleted(data){
            this._clearApiCallTimer();

            // data.guid, data.deleted, data.message
            if (!data.deleted) {
                this.log('Unable to delete interview', data);
                let errs = ['Unable to remove the interview details. Manually delete the interview details from your event.'];
                errs.push(data.message);
                return this._error(errs);
            }

            this.log('Interview successfully deleted', data);

            this.#pageInfo.removeInterviewBodyTextFn((success) => {
                $('#' + JOIN_BUTTON_ID).remove();
                let notifications = ['This interview has been successfully deleted from indeed.'];
                notifications.push('We attempted to remove the invite text from your calendar description - please review and validate all invite text is removed, then save this invite.');
                this._notification(notifications);
            });
        }

        async _init(reminderSeen) {
            if(!this._shouldInitialize) return;
            this.reset();

            RELAY.on('errors.interview', data => {
                this._clearApiCallTimer();
                this._error(data.errors);
            });
            RELAY.on('generated.interview', this.#interviewGenerated.bind(this));
            RELAY.on('deleted.interview', this.#interviewDeleted.bind(this));

            if (!reminderSeen){
                const html = await TEMPLATES.build('interview_getting_started');
                UI.modal(html);
            }
        }
    }

    globals.Interview = Interview;

})(IRX);
