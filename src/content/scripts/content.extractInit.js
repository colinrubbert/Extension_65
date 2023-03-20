/* globals IRX */

(async (globals) => {

    const state = globals.STATE = globals.STATE || new globals.ContentState();
    try{
        // initialize frame Bridge, state, store, etc
        await state.setup();
    }catch(e){
        return console.error(e);
    }

    let pageButtons;
    let extract;
    let configTemplate;

    globals.CONTENT_UTILS.onOrphaned(() => {
        console.info('Content script orphaned, removing extract functionality!');
        if(pageButtons){
            pageButtons.cleanup();
            pageButtons = null;
        }
        if(extract){
            extract.cleanup();
            extract = null;
        }
    });

    state.onUserChange(async (loggedIn, userInfo) => {
        console.log('IRX onUserChang, logged In?', loggedIn, userInfo);
        // Function called when user has changed (log in, log out, proctor updated, etc)

        let advertisersMatch = true;
        let pageAdvertiserKey;
        try{
            pageAdvertiserKey = await globals.Extract.getCurrentPageAdvertiserKey();
        }catch(e){
            return console.error(e);
        }

        if(pageAdvertiserKey !== userInfo.advertiserKey){
            advertisersMatch = false;
            console.log("Current user advertiser doesn't match page advertiser", pageAdvertiserKey, userInfo.advertiserKey);
        }

        if(pageButtons) pageButtons.cleanup();
        if(extract) extract.cleanup();
        if(!loggedIn || !advertisersMatch){
            if(pageButtons) pageButtons = null;
            if(extract) extract = null;
            return;
        }

        try{
            configTemplate = configTemplate || await globals.configTemplates.get('extract');
        }catch(e){
            return console.error(e);
        }

        console.log('IRX extract initiliazed, user logged in!');
        const {integrations, reminders} = userInfo;

        if(pageButtons){
            pageButtons.reset(integrations, reminders);
        }else{
            pageButtons = new globals.PageButtons(integrations, reminders, configTemplate);
        }
        if(extract){
            extract.reset();
        }else{
            extract = new globals.Extract(state.advertiserKey, configTemplate);
        }
    });

})(IRX);
