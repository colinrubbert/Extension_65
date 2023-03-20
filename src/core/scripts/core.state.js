/* globals StateBaseClass */

((globals) => {
    const RELAY = globals.RELAY;

    class CoreState extends StateBaseClass {
        #frameId;

        constructor(env, frameId) {
            super(false, 'CORE STATE');

            this._env = env;
            this.#frameId = frameId;
            this.log('Initialized for env and frame', env, frameId);
        }

        async getApi(){
            return globals.Api.getApi(this.constructor, this._env);
        }
    }

    globals.CoreState = CoreState;

})(this);
