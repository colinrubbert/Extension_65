/* globals IRX, LoggableClass */

(async (globals) => {

    const SENTRY_CONFIG = {
        debug: false,
        dsn: 'https://1893d60d5df14ea4aa4d64c61133030c@sentry.indeed.com/248',
        env: 'prod',
        release: 'IRX@65.0',
        trackViewsManually: true,
        sampleRate: globals.IS_DEV ? 0.0 : 1.0
    };

    class _Sentry extends LoggableClass {
        constructor() {
            super(false);
            this.log('init', SENTRY_CONFIG);
            globals.Sentry.init(Object.assign({},SENTRY_CONFIG));

            // once state is ready, set userInfo
            globals.RELAY.on('updated.state', this.#updateUser.bind(this));
        }

        #updateUser(userInfo){
            const user = {
                id: userInfo.irxUserUuid,
                advertiserKey: userInfo.advertiserKey
            };
            this.log('set user', user);
            globals.Sentry.setUser(user);
        }
    }

    globals.SENTRY = new _Sentry();

})(IRX);
