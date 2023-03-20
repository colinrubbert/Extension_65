'use strict';
/* globals BaseInterviewSupportedSite */

window.outlookInterviewSite = window.outlookInterviewSite || ((window) => {

    class outlookInterviewSite extends BaseInterviewSupportedSite{
        constructor(interviewUrlMatchRe) {
            super(interviewUrlMatchRe, outlookInterviewSite.pageType);

            this.cssClass = 'zi_outlook_interview_btn';

            this.update();
        }

        static get pageType(){
            return 'outlook';
        }

        static matchesUrl(){
            return /^https:\/\/outlook\.live\.com\/calendar\/.+/.test(window.location.href);
        }

        update() {
            this._resetPageInfo();
        }
    }
    return outlookInterviewSite;
})(window);
