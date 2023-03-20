/* globals IRX */

((globals) => {

    class ServiceWorkerBaseClass extends globals.EventableClass {
        #registeredAlarms = {};

        constructor(debug){
            super(debug, globals.EventableClass.levels.serviceWorker);
            this.registerAlarms();
            chrome.alarms.onAlarm.addListener(this.#onAlarm.bind(this));
        }

        registerAlarms(){
            // add any this._addAlarm calls you need
        }

        _addAlarm(fn, intervalMins, triggerNow=false, debounceInterval=false){
            const alarmName = this._alarmName(fn);
            this.log('Creating new alarm', alarmName, `intervalMins = ${intervalMins}`);
            this.#registeredAlarms[alarmName] = {
                fn: fn.bind(this),
                intervalMins,
                debounceInterval
            };
            chrome.alarms.create(alarmName, {delayInMinutes: intervalMins, periodInMinutes: intervalMins});
            if (triggerNow) {
                this.#onAlarm({name: alarmName});
            }
        }

        _alarmName(fn){
            return this.constructor.name + '.' + fn.name;
        }

        get registeredAlarms(){
            return this.#registeredAlarms;
        }

        // exposed global function for test/debug
        async triggerAlarm(fn){
            const name = this._alarmName(fn);
            await this.#onAlarm({name});
        }

        async #onAlarm(alarm) {
            if(!(alarm.name in this.#registeredAlarms)) return;

            this.log('Alarm triggered!', alarm.name);
            const alarmInfo = this.#registeredAlarms[alarm.name];
            this.logNoStore('ALARM INFO', alarmInfo);

            if(alarmInfo.debounceInterval) {
                const tsStoreKey = `_alarmDebounceTs@${alarm.name}`;
                const lastCallTs = await globals.storeUtils.get(tsStoreKey);
                const debounceMs = 1000 * 60 * alarmInfo.intervalMins;
                if (lastCallTs && (Date.now() - lastCallTs) < debounceMs) {
                    return this.log(`Not firing ${alarm.name} alarm , last call was too recent.`);
                }
                await globals.storeUtils.set(tsStoreKey, Date.now());
            }
            
            alarmInfo.fn();
        }
    }

    globals.ServiceWorkerBaseClass = ServiceWorkerBaseClass;
})(IRX);
