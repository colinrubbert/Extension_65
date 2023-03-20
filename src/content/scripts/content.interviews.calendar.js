/* globals IRX */

(async (globals) => {

    const state = globals.STATE || new globals.ContentState();
    try{
        // initialize frame Bridge, state, store, etc
        await state.setup();
    }catch(e){
        return console.error(e);
    }

    let irxInterview;
    let configTemplate;

    globals.CONTENT_UTILS.onOrphaned(() => {
        console.info('Content script orphaned, removing interview functionality!');
        if(irxInterview){
            irxInterview.cleanup();
            irxInterview = null;
        }
    });

    state.onUserChange(async (loggedIn, userInfo) => {
        if(globals.CONTENT_UTILS.isOrphaned) return;

        // Function called when user has changed (log in, log out, proctor updated, etc)

        if(irxInterview) irxInterview.cleanup();
        if(!loggedIn){
            if(irxInterview) irxInterview.cleanup();
            irxInterview = null;
            return;
        }

        const {proctorGroups, preferences, reminders} = userInfo;
        console.info('onUserChange: logged In!', proctorGroups, preferences, reminders);
        
        if(!preferences.interviewEnabled){
            console.info('IRX interview not enabled, turned off in preferences');
            return;
        }

        const reminderKey = 'interviewGettingStarted';
        let reminderSeen = reminders[reminderKey] === true;
        console.info('IRX Interview initialize, user logged in! Reminder seen? ', reminderSeen);

        try{
            configTemplate = configTemplate || await globals.configTemplates.get('interview', false);
        }catch(e){
            return console.error(e);
        }

        irxInterview = new globals.Interview(reminderSeen, configTemplate);
        if(!reminderSeen) state.markReminderSeen(reminderKey);
    });

    globals.STATE = state;
})(IRX);
