/* globals IRX, ServiceWorkerBaseClass */

((globals) => {

    const CHECK_ALARM_INTERVAL_MINS = 5;        // update notification prefs every 5 mins;

    class NotificationSync extends ServiceWorkerBaseClass {
        constructor(state) {
            super(false);

            state.onLoginCallback(() => {
                this._updateNotificationCount(false);
            });
        }

        registerAlarms(){
            this._addAlarm(this._updateNotificationCount, CHECK_ALARM_INTERVAL_MINS, true, true);
        }

        async _updateNotificationCount(assertState=true){

            this.log('Alarm called to update notifications.');

            const STATE = globals.state;

            // NOTE this is an alarm call so we cannot guarantee state is hydrated -- verify quick
            if(assertState) STATE.assertUser();

            if(!STATE.loggedIn) return this.log('Skipping, user is not logged in.');

            if(!STATE.proctorEnabled('irx_bell_icon_tog')){
                return this.log('Skipping, feature not enabled in proctor.');
            }

            // NOTE this preference currently is disabled for everybody but will turn on once enabled
            if(!STATE.preferenceEnabled('notificationsEnabled')){
                return this.log('Skipping, preference disabled!');
            }

            const api = await globals.Api.getApi(STATE.constructor, await this.getEnv());
            // create new notifications class too, not caching this because service worker can drop
            const notifications = new globals.Notifications(globals.EventableClass.levels.serviceWorker);

            try{
                const response = api.call('/public/notification/count');
                if(!response.ok){
                    this.log('Failed to fetch notification count!');
                    // NOTE no need to handle 401 logic here, state component will do that on logout and update badge
                }else{
                    const count = response?.employerNotificationCount?.count || 0;
                    if(count === 0){
                        await globals.extensionUtils.clearBadge();
                    }else{
                        await globals.extensionUtils.showBadge();
                    }
                    await notifications.trackFeatureEventFromCount(count);
                }
            }catch(e){
                console.error(e);
                this.log('Error fetching notification count', e);
            }
        }
    }

    globals.NotificationSync = NotificationSync;
})(IRX);
