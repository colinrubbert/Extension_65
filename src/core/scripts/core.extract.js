/* globals IRX, EventableClass */

((globals) => {

    const RELAY = globals.RELAY;

    class Extract extends EventableClass {
        constructor() {
            super(false, EventableClass.levels.core);

            RELAY.on('saveClip.extract', this.#saveClip.bind(this));
        }

        #extractError(errors) {
            if (!Array.isArray(errors)) errors = [errors];
            RELAY.send('errors.extract', RELAY.levels.content, {errors});
        }

        async #saveClip(data){
            /*
            possible data fields are  {
                source: 'indeed',
                subsource: 'smb_hosted',
                data: {},
                record_type: 'contact'
            };
             */

            const {clipData} = data;
            const api = await globals.STATE.getApi();
            // NOTE -- we use the multi upsert API here so it's treated as a batch, and batch_id is generated!

            if(!('source' in clipData)) clipData.source = 'indeed';
            if(!('record_type' in clipData)) clipData.record_type = 'contact';

            this.log('Save new clip', clipData);

            try {
                const result = await api.call('/proxy/api/v1/clips/multi', 'POST', {clips:[clipData]} );
                const clip = result.data[0];
                this.log('Saved clip successfully!', clip.id);
                this.logNoStore('Clip info', clip);
                RELAY.send('clipSaved.extract', RELAY.levels.content, {batchId: clip.batch_id});
                this.featureEvent('extract','single_record_extracted','indeed', clipData.subsource);
            } catch (e) {
                this.featureEvent('extract','single_record_extract_error','indeed', clipData.subsource);
                this.log('Error saving the clip', e);
                this.#extractError('Unable to save the record to your clipboard, please try again.');
            }
        }
    }

    globals.Extract = Extract;

})(IRX);
