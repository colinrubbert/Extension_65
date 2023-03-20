/* globals IRX, LoggableClass */

((globals) => {

    const RELAY = globals.RELAY;
    const ROOT = 'https://irx-extension-files-prod.irx.indeed.com/65.0/';

    class ConfigTemplates extends LoggableClass {
        constructor() {
            super(false);

            RELAY.on('get.configTemplates', this.#getTemplate.bind(this));
        }

        async #getTemplate(data){
            const name = data.name;
            const url = `${ROOT}config/${name}.config.json`;

            function done(data=null){
                RELAY.send('getReturn.configTemplates', RELAY.levels.content, data);
            }
            this.log('Fetching template', url);

            try{
                let response = await fetch(url);
                let data = await response.json();
                done(data);
            }catch(e){
                console.error(e);
                this.log('Error fetching config template!', e.toString());
                done();
            }
        }
    }

    globals.configTemplates = new ConfigTemplates;

})(IRX);
