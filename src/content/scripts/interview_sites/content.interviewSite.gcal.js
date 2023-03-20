'use strict';
/* globals BaseInterviewSupportedSite */

window.GCalInterviewSite = window.GCalInterviewSite || ((window) => {

    class GCalInterviewSite extends BaseInterviewSupportedSite{
        constructor(config) {
            super(GCalInterviewSite.pageType, config);

            this.WITH_ZOOM_WIDTH = 700;
            this._setButtonClass();

            this.update();
        }

        static get pageType(){
            return 'google';
        }

        static matchesUrl(){
            return /https:\/\/calendar\.google\.com\/calendar\/.+/.test(window.location.href);
        }

        _setButtonClass(extra){
            this.cssClass = 'irx_google_interview_btn';
        }

        showJoinButton(interviewUrl){
            // validate that the Indeed google app isn't installed, and already added a line for the join interview button
            let $addonButton = $(`a[href*="${interviewUrl}"]:contains("Join Indeed Interview")`);
            return $addonButton.length ? false : true; // don't show the button if it's already there from addons
        }

        update(){
            this._resetPageInfo();

            const C = this._config.gcal;

            // three different views to support
            // 1 - Creating a new event
            // 2 - Editing an existing event
            // 3 - Viewing an existing event

            // NEW or EXISTING event modal
            let $modalElem = $(C.modal.type).find(C.modal.title);

            if($modalElem.length > 0){
                this.log('Detected Modal view (new or existing event)');

                // if we can find the modal that we know is for an event create or view, add the buttons if needed
                // modal.type
                this.$parent = $modalElem.first().closest(C.modal.type);

                // When inserting the button make sure modal is still there and insert before save button
                // IF zoom added a button, force width of the modal even wider to accomodate
                const getSaveBtn = () => {
                    return this.$parent.find(C.button.type).filter(C.button.save);
                };

                let $saveBtn = getSaveBtn();
                let eventSelected = this.$parent.find(C.event.selected).length || this.$parent.find(C.event.eventTab).length === 0;

                if($saveBtn.length && eventSelected) {
                    this.showCreateButton = true;
                    this.createBtnInsertFn = (buttonHtml) => {
                        const $saveBtn = getSaveBtn();
                        if ($saveBtn.length) {
                            $saveBtn.after(buttonHtml);
                            // IF zoom is also installed we need to force the width wider to accomodate both buttons
                            try {
                                const $modalInterior = this.$parent.find(C.modal.inside);
                                const zoomInstalled = $modalInterior.find(C.button.zoom).length;
                                if (zoomInstalled) $modalInterior[0].setAttribute('style', `min-width: ${this.WITH_ZOOM_WIDTH = '700'}px !important`);
                            } catch (e) {
                                this.log('Error making modal wide to fit with Zoom button!');
                            }
                        } else {
                            this.log('Not adding \'Create\' button to page, \'Save\' button is not present');
                        }
                    };
                }


                this.joinBtnInsertFn = (buttonHtml) => {

                    const $locBtn = this.$parent.find(C.modal.sub.location); // present for adding NEW

                    const $modalInterior = this.$parent.find(C.modal.inside);
                    if($locBtn.length){
                        const $expandableRow = $locBtn.closest(C.modal.sub.expandable);
                        if($expandableRow.length){
                            $expandableRow.before(buttonHtml);
                        }else{
                            this.log('Not adding interview join button, no location/rooms expandable row');
                        }
                    }else{
                        if($modalInterior.length){
                            const $titleRow = $modalInterior.find(C.modal.sub.titleRow);
                            if($titleRow.length){
                                $titleRow.after(buttonHtml);
                            }else{
                                this.log('Not adding interview join button, cant find title row');
                            }
                        }else {
                            this.log('Not adding interview join button, no location button or modal interior');
                        }
                    }
                };

                this.getInterviewInfoFn = () => {
                    // date in format "Wednesday, Jan 13 [optional], 2023"
                    let date = this.$parent.find(C.modal.sub.startDate).text();
                    date = date.split(', '); // 3 parts includes year else it's current year
                    date.shift(); // remove weekday (i.e. 'Wednesday')
                    let year = date.length === 1 ? (new Date().getFullYear()) : date.pop();

                    let addTimeBtn = this.$parent.find(C.modal.sub.addTime);
                    let addTimeButtonExists = addTimeBtn ? addTimeBtn.length > 0 : false;

                    let startTime = this.$parent.find(C.modal.sub.startTime).text();
                    let endTime = this.$parent.find(C.modal.sub.endTime).text();

                    let titleElem = this.$parent.find(C.modal.title);

                    let title = titleElem.val();
                    const [timezone, gmtOffset] = this._getTimezoneInfo(this.$parent);

                    return {date: date[0], startTime, endTime, year, title, timezone, gmtOffset, addTimeButtonExists};
                };

            }else if(window.location.pathname.split('/').includes('eventedit')
            || $(C.page.type).length
            ){
            // Full page window event view
                this.log('Detected full-page window for event edit');

                this.$parent = $(C.page.type).find(C.page.details);
                if(this.$parent.length){
                    // move the parent ref up to the larger element that includes the interview text
                    this.$parent = this.$parent.parent();
                    this.$parent = this.$parent.parent();
                }

                // tabEventDetails
                this.showCreateButtonRow = true;
                this.showDeleteButton = true;
                this.createBtnInsertFn = this.joinBtnInsertFn = (buttonHtml) => {
                    const $tabPanel = $(C.page.tabPanel).first();
                    $tabPanel.prepend(buttonHtml);
                };

                this.getInterviewInfoFn = () => {
                    const $top = this.$parent.closest(C.page.roleMain);

                    let date,
                        year,
                        dateVal = $top.find(C.page.interior.startDate).val();

                    if(dateVal) {
                        // Format is 'Aug 9, 2022'
                        [date, year] = dateVal.split(',');
                    }

                    let startTime = $top.find(C.page.interior.startTime).val();
                    let endTime = $top.find(C.page.interior.endTime).val();

                    let title = $top.find(C.page.interior.title).val();
                    const [timezone, gmtOffset] = this._getTimezoneInfo(this.$parent.closest(C.page.interior.isCreate));

                    return {date, startTime, endTime, year, title, timezone, gmtOffset};
                };

            }

            // NOTE this function works the same in every view of the google calendar, relative to $parent
            this.removeInterviewBodyTextFn = (cb) => {
                // cb = (success) =>
                let $descBtn = this.$parent.find(C.event.description);
                if($descBtn.length){
                    $descBtn.click();
                }
                setTimeout((() => {
                    let $editable = this.$parent.find(C.event.editableDescription);
                    if ($editable.length) {
                        let $blob = $editable.children(C.event.editableBlob);
                        $editable.html(this._stripInterviewLinks(($blob.length ? $blob : $editable)[0].innerHTML));
                        cb(true);
                    } else {
                        cb(false);
                    }
                }).bind(this), 500);
            };

            // NOTE this function works the same in every view of the google calendar, relative to $parent
            this.setInterviewBodyTextFn = (html, cb) => {
                let $descBtn = this.$parent.find(C.event.descButton);
                if($descBtn.length){
                    $descBtn.click();
                }

                setTimeout(() => {
                    let $editable = this.$parent.find(C.event.editableDescription);
                    if ($editable.length) {
                        $editable.prepend(html);
                        $editable[0].dispatchEvent(new Event('keyup', {bubbles: true}));
                        cb(true);
                    } else {
                        this.log('Unable to copy link to calendar text, $editable element not found');
                        cb(false);
                    }
                }, 500);
            };
        }

        _getTimezoneInfo($parent){
            const C = this._config.gcal;
            let timezone, gmtOffset;
            try{
                const tzData = JSON.parse(document.getElementById(C.event.txData).textContent)[0];

                // use regexp to find div with tooltip and ariaLabel like "(GMT+/-10:00) Some Time"
                const tzRe = /^\(GMT([+-])([0-9]{1,2}):([0-9]{2})\)\s.+$/i;

                let $tzButton = $parent.find('span,div').not(':has(*)')
                    .filter(function(){
                        let content = this.innerText;
                        return tzRe.test(content);
                    });
                if($tzButton.length > 0){
                    let tzString = $tzButton[0].innerText;
                    let tzObj = tzData.find((tzi) => {
                        return tzi[1] == tzString;
                    });
                    if(tzObj){
                        timezone = tzObj[0];
                        let match = tzString.match(tzRe);
                        let minutes = parseInt(match[3],10) + (60 * parseInt(match[2],10));
                        gmtOffset = minutes * 60 * 1000;
                        if(match[1] === '-') gmtOffset = 0 - gmtOffset;
                    }
                }else{
                // if no custom timezone selected, just grab defaults
                    if(!timezone) timezone = $('#xTimezone').text();
                    if(!gmtOffset) gmtOffset = $('#xGmtOffset').text();
                }
            }catch(e){
                this.log('Error getting timezones', e);
            }

            this.log('Timezone info: ', timezone, gmtOffset);

            return [timezone, gmtOffset];
        }
    }
    return GCalInterviewSite;
})(window);
