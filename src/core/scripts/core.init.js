/* globals IRX */


(async (globals) => {

    const dependencyOrigin = 'https://irx-extension-files-prod.irx.indeed.com/65.0/';

    console.log('Loading core init.', dependencyOrigin);
    const frameBridge = new globals.FrameBridge(true);

    globals.INTERVIEW = new globals.Interview();
    globals.EXTRACT = new globals.Extract();
    globals.STATE = new globals.CoreState(frameBridge.env, frameBridge.frameId);

    frameBridge.markReady();

})(IRX);
