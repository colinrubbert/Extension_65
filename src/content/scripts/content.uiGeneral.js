/* globals IRX, LoggableClass */

(async (globals) => {

    const TEMPLATES = globals.TEMPLATES;
    const OVERLAY_ID = 'irx_modal_overlay';
    const MODAL_INSIDE_ID = 'irx_modal_inside';
    const CLOSE_BUTTON_ID = 'irx_modal_close_btn';

    const GENERIC_ERROR_TEXT = 'An error has occured -- please try again, or contact support if the issue persists.';

    class UiGeneral extends LoggableClass {
        #eventsBound;

        constructor() {
            super(false);
            this.#eventsBound = false;
        }

        _bindEvents() {
            if (this.#eventsBound) return;
            this.#eventsBound = true;
            $(document.body).on('click.irx', `#${OVERLAY_ID}`, (e) => {
                if(globals.CONTENT_UTILS.isOrphaned) return;
                e.stopImmediatePropagation();
                let $over = $(e.target).closest(`#${OVERLAY_ID}`);
                if (!$over.is('[data-closable]')) return;
                if (!$(e.target).closest(`#${MODAL_INSIDE_ID}`).length) {
                    this.close();
                }
            }).on('click.irx', `#${CLOSE_BUTTON_ID}`, (e) => {
                if(globals.CONTENT_UTILS.isOrphaned) return;
                e.stopImmediatePropagation();
                e.preventDefault();
                this.close();
            });
        }

        // remove existing overlay
        #removeOverlay() {
            $('#' + OVERLAY_ID).remove();
        }

        // close any open modals
        close(){
            this.#removeOverlay();
            globals.RELAY.localSend('modalClose.ui');
        }

        // Show loading overlay
        async loading(loadText){
            const html = await TEMPLATES.build('UI_loading', {loadText});
            return this.#drawModal(html, false);
        }

        // Open a Modal with interior HTML
        modal(html, showCloseButton=true){
            this.#drawModal(html, showCloseButton);
        }

        // Show errors (errors can be string or array of strings)
        async error(errors){
            if(!Array.isArray(errors)) errors = [errors];
            errors = [...new Set(errors)]; // dedupe
            const html = await TEMPLATES.build('UI_errors', {errors});
            return this.#drawModal(html, true);
        }

        genericError(){
            return this.error(GENERIC_ERROR_TEXT);
        }

        // Show notifications(s) (they can be string or array of strings)
        async notification(notifications){
            if(!Array.isArray(notifications)) notifications = [notifications];
            notifications = [...new Set(notifications)]; // dedupe
            const html = await TEMPLATES.build('UI_notifications', {notifications});
            return this.#drawModal(html, true);
        }
        
        async #drawModal(htmlContent = '', showCloseButton = false) {
            const templateData = {
                wrapId: OVERLAY_ID,
                isModalContent: true,
                modalInsideId: MODAL_INSIDE_ID,
                closeButtonId: CLOSE_BUTTON_ID,
                html: htmlContent,
                showCloseButton,
            };
            const html = await TEMPLATES.build('UI_overlay', templateData);
            this.log('Add overlay HTML', html);
            this.#removeOverlay();
            $(document.body).append(html);
            this._bindEvents();
        }

        async fullpageUi(htmlContent){
            const templateData = {
                wrapId: OVERLAY_ID,
                html: htmlContent
            };
            const html = await TEMPLATES.build('UI_fullpage', templateData);
            this.log('Add fullpage HTML', html);
            this.#removeOverlay();
            $(document.body).append(html);
        }
    }

    globals.UI = new UiGeneral();

})(IRX);
