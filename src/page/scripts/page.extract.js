/* globals IRX, LoggableClass */

((globals) => {

    const RELAY = globals.RELAY;

    class Extract extends LoggableClass {
        constructor() {
            super(false);
            RELAY.on('requestAdvertiserKey.extract', this._getAdvertiserKey.bind(this));
        }

        _getAdvertiserKey() {
            this.log('Request advertiser key from page.');
            let advertiserKey;
            try {
                advertiserKey = window.__INTERNAL_ONEHOST_APPDATA.advertiser.advertiserKey;
            } catch (e) {
                this.log('Error fetching advertiserKey from onehost data', e);
            }
            RELAY.send('returnAdvertiserKey.extract', RELAY.levels.content, {advertiserKey});
        }
    }

    globals.EXTRACT = new Extract();

})(IRX);
