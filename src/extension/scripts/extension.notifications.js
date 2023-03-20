/* globals IRX */

((globals) => {

    const WAS_BADGE_SHOWN_STORE_KEY = 'taskbarBadgeShown';
    const FEATURE_NAME = 'notifications';

    class Notifications extends globals.EventableClass {
        constructor(eventableClassLevel) {
            super(false, eventableClassLevel);
        }

        async trackFeatureEventFromCount(count){
            let isShown = await this.isBadgeCurrentlyVisible();
            // get isPinned
            const isPinned = await globals.extensionUtils.isExtensionIconPinned();
            let featureActionName;

            if(isShown && count === 0){
                // notifications were cleared
                await this.#markBadgeAsCleared();
                featureActionName = `taskbar_badge_cleared_${isPinned ? 'pinned' : 'unpinned'}`;

            }else if(!isShown && count > 0){
                // notifications are being shown
                await this.#markBadgeAsShown();
                featureActionName = `taskbar_badge_impression_${isPinned ? 'pinned' : 'unpinned'}`;
            }

            if(featureActionName){
                this.log('Logging feature event for notification:', featureActionName);
                await this.featureEvent(FEATURE_NAME, featureActionName);
            }
        }

        // returns a promise
        isBadgeCurrentlyVisible(){
            return globals.storeUtils.get(WAS_BADGE_SHOWN_STORE_KEY) || false;
        }

        // returns a promise
        #markBadgeAsShown(){
            globals.storeUtils.set(WAS_BADGE_SHOWN_STORE_KEY, true);
        }

        // returns a promise
        #markBadgeAsCleared(){
            return globals.storeUtils.set(WAS_BADGE_SHOWN_STORE_KEY, false);
        }

        test(){
            return 'foo';
        }
    }

    globals.Notifications = Notifications;

})(IRX);
