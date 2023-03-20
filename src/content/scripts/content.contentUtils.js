/* globals IRX, LoggableClass */

(async (globals) => {

    const ORPHAN_INTERVAL_CHECK_MS = 1000; // check every 1 second

    class ContentUtils extends LoggableClass {
        #isOrphaned = false;
        #onOrphanedCallbacks = [];
        #boundEventListeners = [];
        #orphanCheckIntervalTmo;

        constructor() {
            super(false);
            window.addEventListener(this.orphanMessageId, this.#unregisterOrphan.bind(this));
            this.#orphanCheckIntervalTmo = setInterval(this.#unregisterOrphan.bind(this), ORPHAN_INTERVAL_CHECK_MS);
            window.dispatchEvent(new Event(this.orphanMessageId));
        }

        unbindChromeEventListener(listenerFn, fn){
            const index = this.#boundEventListeners.findIndex(listener => {
                return listenerFn === listener.listenerFn && fn === listener.fn;
            });
            if(index !== -1){
                let listener = this.#boundEventListeners[index];
                listener.listenerFn.removeListener(listener.closure);
                listener = null;
                this.#boundEventListeners.splice(index, 1);
            }
        }

        bindChromeEventListener(listenerFn, fn, bindTo){
            // This is somewhat convaluted
            // when passing in a function (fn) do NOT bind it to (this) or anything else, instead pass in what you
            // want to bind it to in bindTo -- this is needed for function signature matching for unbinding

            const boundFn = fn.bind(bindTo);
            const _listener = (msg) => {
                if(this.isOrphaned || this.#unregisterOrphan()){
                    return this.logNoStore('Not calling listener, content script is orphaned!');
                }
                boundFn(msg);
            };
            this.#boundEventListeners.push({closure: _listener, listenerFn, fn });
            listenerFn.addListener(_listener);
        }

        #unregisterOrphan(){
            if(this.isOrphaned) return;
            try {
                if (chrome.runtime.id) {
                    return; // this.logNoStore('Call to _unregisterOrphan, but extension context still valid');
                }
            }catch(e){}

            this.log('Content script has been orphaned!');

            this.#isOrphaned = true;
            clearInterval(this.#orphanCheckIntervalTmo);
            window.removeEventListener(this.orphanMessageId, this.#unregisterOrphan);
            this.#boundEventListeners.forEach(listener => {
                try{
                    listener.listenerFn.removeListener(listener.closure);
                }catch(e){
                    this.logNoStore('Error removing listener', listener, e);
                }
            });
            this.#onOrphanedCallbacks.forEach(cb => cb());

            this.#boundEventListeners = [];
            this.#onOrphanedCallbacks = [];
        }

        onOrphaned(cb){
            if(this.isOrphaned) return cb();
            this.#onOrphanedCallbacks.push(cb);
        }

        get orphanMessageId(){
            return chrome.runtime.id + 'orphanCheck';
        }

        get isOrphaned(){
            return this.#isOrphaned;
        }
    }

    globals.CONTENT_UTILS = new ContentUtils();

})(IRX);
