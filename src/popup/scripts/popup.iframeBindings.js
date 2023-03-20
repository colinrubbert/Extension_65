/* globals IRX, EventableClass */

((globals) => {


    class IframeBindings extends EventableClass {
        #boundListeners = {};
        #componentName;
        #notifications = new globals.Notifications(EventableClass.levels.popup);

        constructor(state, componentName){
            const debugOverride = globals.UTILS.isQueryParamPresent('messageDebug');
            super(debugOverride || false, EventableClass.levels.popup);
            this.#componentName = componentName;
            this.#bindAll(state);

            this.lifecycleEvent('popup_window_opened');
        }

        trigger(msg, data=null){
            if(msg in this.#boundListeners){
                this.#boundListeners[msg](data);
            }
        }

        #msgRecieved(msg, data){
            this.log('::MESSAGE FROM IFRAME >> ', msg, data);
            this.#boundListeners[msg](data);
        }

        #send(msg, data=null){
            globals.RELAY.componentSend(msg, data, this.#componentName);
        }

        #bind(msg, fn, bindFunctionGlobal = true, globalBindArgs = []){
            this.#boundListeners[msg] = fn;
            globals.RELAY.componentOn( msg, this.#componentName,(data) => {
                this.#msgRecieved(msg, data);
            });

            if(bindFunctionGlobal){
                this.log(`Binding global function ${msg}(${globalBindArgs})`);
                globals[msg] = (...args) => {
                    let data = {};
                    globalBindArgs.forEach((argName, ind) => {
                        data[argName] = args[ind];
                    });
                    args.length > 0 ? this.#boundListeners[msg](data) : this.#boundListeners[msg]();
                };
            }
        }

        #bindAll(state) {
            this.log('binding all iframe listeners');

            this.#bind('setEnv', (data) => {
                globals.RELAY.localSend('changeEnv.state', {env: data.env});
            }, true, ['env']);

            this.#bind('downloadLogs', async (_data) => {
                const irxUserUuid = state.irxUserUuid;
                const fname = 'IRX_LOGS_' + (irxUserUuid || 'no_user') + '_' + new Date().getTime() + '.txt';
                const dataUri = await globals.LOG_TOOLS.getLogsDataUri();
                let elem = document.createElement('a');
                elem.setAttribute('download', fname);
                elem.setAttribute('href', dataUri);
                elem.click();
                this.#send('downloadLogsResponse');
            });

            this.#bind('purgeLogs', async (_data) => {
                await globals.LOG_TOOLS.clear();
                this.#send('purgeLogsResponse');
            });

            this.#bind('resetNotifications', async () => {
                await globals.storeUtils.delete('reminders');
                this.#send('resetNotificationsResponse');
            });

            this.#bind('openUrl', async (data) => {
                await globals.extensionUtils.openUrl(data.url, data.active);
                // TODO -- make some decision on window close?
                if(data.active !== false) window.close();
            }, false, ['url']);

            this.#bind('advertiserChanged', (_data) => {
                console.error('DO RELOAD OF TABS');
                globals.extensionUtils.reloadSupportedTabs();
            });

            this.#bind('setIconBadgeCount', async (data) => {
                globals.extensionUtils.setBadgeCount(data.count);
                await this.#notifications.trackFeatureEventFromCount(data.count);
            }, ['count']);

            this.#bind('desktopNotification', async (_data) => {
                // TODO
                // globals.extensionUtils.desktopNotification();
            });

            this.#bind('extract', async (_data) => {
                let tabs = await chrome.tabs.query({active: true, currentWindow: true});
                if(!tabs || !tabs.length) return console.error('No available tabs');

                await chrome.tabs.sendMessage( tabs[0].id, 'popup.extract');
                window.close();
            });

            this.#bind('openPopupAsWindow', async () => {
                globals.extensionUtils.openPopupDebugWindow();
                window.close();
            }, true);

            this.#bind('markReminderSeen', async (data) => {
                await state.markReminderSeen(data.reminderKey);
                this.#send('markReminderSeenResponse', {reminderKey: data.reminderKey});
            }, true, ['reminderKey']);

            this.#bind('updatePreferences', async (data) => {
                await state.updatePreferences(data.preferences);
                await globals.extensionUtils.reloadSupportedTabs();
                this.#send('updatePreferencesResponse');
            }, true, ['preferences']);
        }
    }
    
    globals.IframeBindings = IframeBindings;
})(IRX);
