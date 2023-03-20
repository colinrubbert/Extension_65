/* globals IRX */

((globals) => {

    if(globals.IS_DEV){
        const connection = new WebSocket('ws://localhost:8088/livereload');
        connection.onmessage = function (e) {
            if (e.data) {
                let data = JSON.parse(e.data);
                if (data && data.command === 'reload') {
                    console.error('LIVERELOAD');
                    globals.RELAY.send('liveReload.state', globals.RELAY.levels.iframe_shim);
                }
            }
        };
    }

})(IRX);
