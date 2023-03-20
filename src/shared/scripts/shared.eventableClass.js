/* globals IRX */

((globals) => {

    const LEVELS = Object.freeze({
        core: 'core',
        content: 'content',
        extension: 'extension',
        serviceWorker: 'serviceWorker',
        popup: 'popup'
    });

    const EVENT_TYPES = Object.freeze({
        feature: 'feature',
        lifecycle: 'lifecycle'
    });

    class EventableClass extends globals.LoggableClass{
        _relayToLevel = null; // if NULL, do localSend
        _currentRelayLevel = null;

        constructor(debug, currentLevel){
            super(debug);

            switch(currentLevel){
            case this.constructor.levels.core:
                this._currentRelayLevel = globals.RELAY.levels.iframe;
                this._relayToLevel = globals.RELAY.levels.iframe_shim;
                break;
            case this.constructor.levels.content:
                this._currentRelayLevel = globals.RELAY.levels.content;
                this._relayToLevel = globals.RELAY.levels.iframe_shim;
                break;
            case this.constructor.levels.extension:
            case this.constructor.levels.popup:
            case this.constructor.levels.serviceWorker:
                this._relayToLevel = null; // do localSend
            }
        }

        _eventSend(eventType, data){
            const eventMsg = `${eventType}.event`;

            return new Promise((resolve) => {
                const eventId = new Date().getTime();
                data._originLevel = this._currentRelayLevel;
                data._eventId = eventId;

                globals.RELAY.onOnce(`confirmSent_${eventId}.event`, resolve);

                if(!this._relayToLevel){
                    globals.RELAY.localSend(eventMsg, data);
                }else {
                    globals.RELAY.send(eventMsg, this._relayToLevel, data);
                }
            });
        }

        lifecycleEvent(event, trackId=null){
            this.log('log lifecycle event', event);
            return this._eventSend(EVENT_TYPES.lifecycle, {event});
        }

        featureEvent(feature, action, site=null, sitePage=null, surface=null, refId=null){
            const data = {feature, action, site, sitePage, surface, refId};
            this.log('log feature event', data);
            return this._eventSend(EVENT_TYPES.feature, data);
        }

        static get levels(){
            return LEVELS;
        }
    }

    globals.EventableClass = globals.EventableClass || EventableClass;
})(IRX);
