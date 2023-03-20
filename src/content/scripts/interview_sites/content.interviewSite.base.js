/* globals LoggableClass */

window.BaseInterviewSupportedSite = window.BaseInterviewSupportedSite || ((window) => {
    
    class BaseInterviewSupportedSite extends LoggableClass {
        constructor(pageType, config) {
            super(false);
            this._config = config;
            this.CANDIDATE_SHORTLINK_URL_MATCH_RE = /https:\/\/(linkr|l)\.(indeed\.com|sandbox\.qa\.indeed\.net)\/[^\/]+\//gi;
            this.INTERVIEW_URL_MATCH_RE = /https:\/\/interviews\.(sandbox\.)?(qa\.)?indeed\.(net|com)\/(employers\/)?events\/[^\/]+\//gi;

            // these are set only initially
            this.PAGE_TYPE = pageType;

            this.cssClass = null;
            this._debug = false;

            this._resetPageInfo();

            this.log('New interview supported type created', pageType);
        }

        _resetPageInfo(){
            // things that are set/change with this.update() called
            this.$parent;
            this.createBtnInsertFn;             // function to use when adding create button
            this.joinBtnInsertFn;               // function to use for adding join button
            this.getInterviewInfoFn;            // function to gather the needed info to creat the interview
            this.setInterviewBodyTextFn;        // function to set the text in the interview body when generated
            this.removeInterviewBodyTextFn;     // function to remove interview text from the body.
            this.poll = true;                   // should we continue polling the page if we're shwoing a button?
            this.interviewUrl = null;           // the interview URL detected on the page
            this.showCreateButton = false;      // should we show the create button?
            this.showDeleteButton = false;      // should we show the delete button?
            this.showCreateButtonRow = false;   // should we show the create button as a row?
        }

        get pageInfo(){
            let pgInfo = {
                $parent: this.$parent,
                poll: this.poll,
                interviewUrl: this.interviewUrl,
                cssClass: this.cssClass,
                pageType: this.PAGE_TYPE,
                showCreateButton: this.showCreateButton,
                showCreateButtonRow: this.showCreateButtonRow,
                showDeleteButton: this.showDeleteButton,
                createBtnInsertFn: this.createBtnInsertFn ? this.createBtnInsertFn.bind(this) : null,
                joinBtnInsertFn: this.joinBtnInsertFn ? this.joinBtnInsertFn.bind(this) : null,
                getInterviewInfoFn: this.getInterviewInfoFn ? this.getInterviewInfoFn.bind(this) : null,
                setInterviewBodyTextFn: this.setInterviewBodyTextFn ? this.setInterviewBodyTextFn.bind(this) : null,
                removeInterviewBodyTextFn: this.removeInterviewBodyTextFn ? this.removeInterviewBodyTextFn.bind(this) : null
            };
            return pgInfo;
        }

        // override if needed
        showJoinButton(interviewUrl){
            return true;
        }

        // function that checks the page to see if things are different, set new functions, etc
        update(){
            throw new Error('Must implement');
        }

        // return boolean value, does this site match (i.e. are we on that site)
        static matchesUrl(){
            throw new Error('Must Implement');
        }

        _stripInterviewLinks(html){
            // This function makes 2 regexes that will strip the candidate and interviewer link lines
            // The annoyance here is that google rewrites URLs and if styling is changed, it can get screwed up too
            // so these regexpes are quite complicated and generous, but they work

            const urlMatchStr = '([a-z0-9:\\/.?&_=;%-])+';

            let removeCandidateLinkRe = new RegExp('(<b>)?Candidate Link:(<\/b>)? ' +
                '(<a href="'+urlMatchStr+'">)?(' + this.CANDIDATE_SHORTLINK_URL_MATCH_RE.source + '){1}(<\/a>)?(<br>)*', 'gi');
            this.log('removeCandidateLinkRe', removeCandidateLinkRe.source);

            let removeInterviewerLinkRe = new RegExp('(<b>)?Interviewer Link:(<\/b>)? ' +
                '(<a href="'+urlMatchStr+'">)?(' + this.INTERVIEW_URL_MATCH_RE.source + '){1}(<\/a>)?(<br>)*', 'gi');
            this.log('removeInterviewerLinkRe', removeInterviewerLinkRe.source);

            const removeSigninLineRe = /If prompted, please click (<b>)?Sign in with Google(<\/b>)? using your Indeed email.(<br>)*/gi;
            const removeTosLineRe = new RegExp('By continuing, you agree to our (<a href="' +
                urlMatchStr + '">)?Terms, Cookies, &amp; Privacy Policies(<\/a>)?.(<br>)*', 'gi');
            const removeJoiningLineRe = new RegExp('(<a href="'+urlMatchStr +'">)?Joining Instructions(<\/a>)?.(<br>)*', 'gi');

            const strippedhtml = html.replace(removeCandidateLinkRe, '').replace(removeInterviewerLinkRe, '')
                .replace(removeSigninLineRe, '').replace(removeTosLineRe,'').replace(removeJoiningLineRe,'');

            this.log('New HTML after strip links', strippedhtml);
            return strippedhtml;
        }
    }

    return BaseInterviewSupportedSite;
})(window);
