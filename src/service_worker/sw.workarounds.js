/* globals IRX, EventableClass */
/*eslint no-constant-condition: "off"*/

// NOTE -- this is a temporary workaround due to the dumb bugs that affect mv3 serviceWorkers
// More info here: https://bugs.chromium.org/p/chromium/issues/detail?id=1316588#c96
// and here: https://bugs.chromium.org/p/chromium/issues/detail?id=1271154
// and here: https://bugs.chromium.org/p/chromium/issues/detail?id=1368619

// Workaround we do here for watchdog might have been fixed in Chromium 110 but we have not yet confirmed
// https://bugs.chromium.org/p/chromium/issues/detail?id=1247690

((globals) => {

    const WATCHDOG_DELAY_TEST_MINS = 1;
    const WATCHDOG_ALARM_PADDING_CHECK_SECONDS = 80;
    const WATCHDOG_ALARM_LOOP_AWAIT_EXTRA_SECONDS = 3;
    const WATCHDOG_MISSED_ITER_CHECKS_MAX = 3;
    const WATCHDOG_MINIMUM_RESTART_WAIT_MINUTES = 60;
    const WATCHDOG_ALARM_NAME_PREFIX = 'Workarounds.lostEventsWatchdog/';

    class Workarounds extends EventableClass {
        #lastWatchdogAlarm;
        #missedWatchdogCheckCount;
        #nextAlarmId;

        constructor() {
            super(false, EventableClass.levels.serviceWorker);
            this.resetWatchdog();
            this.#refreshFromStore();
            this.#setupWatchdog();
        }

        async resetWatchdog(){
            this.#lastWatchdogAlarm = Date.now();
            this.#missedWatchdogCheckCount = 0;
            this.#nextAlarmId;
            this.#updateWatchdogValsToStore(true);
        }

        async #refreshFromStore(){
            const lastWatchDogAlarm = await globals.storeUtils.get('watchdog.lastAlarm') || Date.now();
            const missedWatchdogCheckCount = await globals.storeUtils.get('watchdog.missedWatchdogCheckCount');
            if(lastWatchDogAlarm){
                this.#lastWatchdogAlarm = lastWatchDogAlarm;
            }
            this.#missedWatchdogCheckCount = missedWatchdogCheckCount || 0;
            this.#nextAlarmId = await globals.storeUtils.get('watchdog.nextAlarmId') || this.#nextAlarmId || 0;
        }

        async #watchdogIter(){
            await this.#refreshFromStore();
            const now = Date.now();
            const timeSinceLastAlarm = now - this.#lastWatchdogAlarm;
            this.watchdogLog(`watchdogIter, should be "${this.#nextAlarmId}", Last alarm ${timeSinceLastAlarm/1000}s ago`);

            // Check and see if the last time the alarm fired (and updated lastWatchdogAlarm) was within tolerance of what we
            // think is acceptible

            if(timeSinceLastAlarm > (WATCHDOG_ALARM_PADDING_CHECK_SECONDS * 1000)){
                this.watchdogLog('Missed threshold for checking last alarm fire!');
                if (++this.#missedWatchdogCheckCount >= WATCHDOG_MISSED_ITER_CHECKS_MAX) {
                    this.watchdogLog(`Reloading due to serviceWorker lock, alarms not fired for ${WATCHDOG_MISSED_ITER_CHECKS_MAX} checks!`);
                    return this.doWatchdogReload();
                }
            }else{
                // alarm still works.
                this.watchdogLog('Successful tolerance check, alarm still works');
                this.#missedWatchdogCheckCount = 0;
            }

            this.watchdogLog(`Setting new alarm, ID is ${now}`);
            // set an alarm to fire in 1 minute, which will set lastWatchdogAlarm to TS of when it runs
            chrome.alarms.create(`${WATCHDOG_ALARM_NAME_PREFIX}@${now}`, {delayInMinutes: WATCHDOG_DELAY_TEST_MINS});
            setTimeout(this.#watchdogIter.bind(this), this.watchdogTimeoutMs);
            this.#nextAlarmId = now;

            await this.#updateWatchdogValsToStore();
        }

        async #updateWatchdogValsToStore(includeLastAlarmTime=false){
            let toSet = {
                'watchdog.missedWatchdogCheckCount': this.#missedWatchdogCheckCount,
                'watchdog.nextAlarmId': this.#nextAlarmId
            };
            if(includeLastAlarmTime){
                toSet['watchdog.lastAlarm'] = this.#lastWatchdogAlarm;
            }
            await globals.storeUtils.setMulti(toSet);
        }

        get watchdogTimeoutMs(){
            return (1000 * 60 * WATCHDOG_DELAY_TEST_MINS) + (WATCHDOG_ALARM_LOOP_AWAIT_EXTRA_SECONDS * 1000);
        }

        #setupWatchdog() {
            chrome.alarms.onAlarm.addListener(this.#onAlarm.bind(this));
            this.#watchdogIter();
        }

        async #onAlarm(alarm) {
            if(!alarm.name.startsWith(WATCHDOG_ALARM_NAME_PREFIX)) return;
            this.#lastWatchdogAlarm = Date.now();
            const alarmId = alarm.name.split('@').pop();
            await globals.storeUtils.set('watchdog.lastAlarm', this.#lastWatchdogAlarm);
            this.watchdogLog(`Alarm hit (ID ${alarmId})`, this.#lastWatchdogAlarm);
        }

        watchdogLog(...args) {
            this.log(...['Watchdog'].concat(args));
        }

        async doWatchdogReload() {
            globals.extensionUtils.restartIfAllowed(WATCHDOG_MINIMUM_RESTART_WAIT_MINUTES, async () => {
                await this.lifecycleEvent('extension_watchdog_reload');
                await globals.storeUtils.set('watchdog.lastRestart', Date().toString());
            });
        }

        get chromiumVersion(){
            return navigator.userAgentData?.brands.find(b => b.brand === 'Chromium').version;
        }
    }

    globals.WORKAROUNDS = new Workarounds();

})(IRX);
