/* globals IRX, EventableClass */

((globals) => {

    const RELAY = globals.RELAY;

    class Interview extends EventableClass {
        constructor() {
            super(false, EventableClass.levels.core);

            RELAY.on('delete.interview', this.#deleteInterview.bind(this));
            RELAY.on('generate.interview', this.#generateInterview.bind(this));
        }

        #interviewError(errors) {
            if (!Array.isArray(errors)) errors = [errors];
            RELAY.send('errors.interview', RELAY.levels.content, {errors});
        }

        async #deleteInterview(data) {
            const {guid, pageType} = data;
            const api = await globals.STATE.getApi();

            function done(deleted, message) {
                RELAY.send('deleted.interview', RELAY.levels.content, {guid, deleted, message});
            }

            this.log('Deleting interview', guid);
            try {
                const result = await api.call('/proxy/api/v2/indeed/virtual_interview_platform/remove',
                    'POST',
                    {interview_uuid: guid}
                );
                this.featureEvent('interview','deleted', pageType, 'calendar');
                done(true, result.message);
            } catch (e) {
                // some kind of error!
                this.log('Error deleting interview', e);
                this.featureEvent('interview','delete_error', pageType, 'calendar');
                done(false, 'Unable to delete this interview -- you can delete it manually in the invite text');
            }
        }

        async #generateInterview(data) {
            // {
            //     date: 'January 19',
            //     startTime: '3:00pm',
            //     endTime: '4:00pm',
            //     year: '2022',
            //     title: 'FooBar',
            //     timezone: '(GMT-05:00) Central Time - Chicago',
            //     language: 'en-US'
            // }
            const {info, pageType} = data;
            const api = await globals.STATE.getApi();
            this.log('Create new event with data.', info);

            try {
                const result = await api.call('/proxy/api/v2/indeed/virtual_interview_platform/create', 'POST', info );
                this.log('Generated interview link successfully!', result.uuid);
                this.logNoStore('Interview details:', result);
                RELAY.send('generated.interview', RELAY.levels.content, {
                    candidate_url: result.rsvps[0].interview_url,
                    candidate_short_url: result.rsvps[0].shortened_url,
                    lobby_url: result.employer_lobby_url
                });
                this.featureEvent('interview','generated', pageType, 'calendar');
            } catch (e) {
                // some kind of error!
                this.featureEvent('interview','generate_error', pageType, 'calendar');
                this.log('Error creating interview', e);
                this.#interviewError('Unable to generate an interview link, please try again.');
            }
        }
    }

    globals.Interview = Interview;

})(IRX);
