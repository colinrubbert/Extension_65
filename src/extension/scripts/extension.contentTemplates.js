/* globals IRX, LoggableClass */

((globals) => {
    const RELAY = globals.RELAY;

    class ContentTemplates extends LoggableClass {
        constructor() {
            super(false);
            RELAY.on('fetch.templates', this.#fetchTemplate.bind(this));
        }

        #fetchTemplate(d) {
            this.log('Loading HBS template', d.name, d.data);
            const name = d.name;
            const template = globals['HBS_TEMPLATES_PRECOMPILED'][name].hbs(d.data);
            this.log('Template loaded.', d.name);
            RELAY.send('fetched.templates', RELAY.levels.content, {name, template});
        }
    }

    globals.contentTemplates = new ContentTemplates();

    // Register all the needed helpers
    function capitalize(str){
        if (!str) return str;
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function _escapeHtml(txt) {
        let map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            '\'': '&#039;'
        };
        return txt.replace(/[&<>"']/g, (m) => map[m]);
    }

    const HB = globals.Handlebars;

    HB.registerHelper('labelize', (s) => {
        return !s ? 'Unknown' : capitalize;
    });
    HB.registerHelper('switch', function (value, options) {
        this._switch_value_ = value;
        let html = options.fn(this); // Process the body of the switch block
        delete this._switch_value_;
        return html;
    });
    HB.registerHelper('case', function () {
        // Convert "arguments" to a real array - stackoverflow.com/a/4775938
        let args = Array.prototype.slice.call(arguments),
            options = args.pop(),
            caseValues = args;
        if (caseValues.indexOf(this._switch_value_) === -1) {
            return '';
        } else {
            return options.fn(this);
        }
    });
    HB.registerHelper('extension_url', (opts) => {
        return globals.UTILS.extensionUrl( opts.fn(this) );
    });
    HB.registerHelper('equals', function (a, b, options) {
        if (a == b) return options.fn(this);
    });
    HB.registerHelper('capitalize', (str) => {
        return new HB.SafeString(
            capitalize(str)
        );
    });
    HB.registerHelper('labelize', (s) => {
        return new HB.SafeString(
            !s ? 'Unknown' : capitalize(s)
        );
    });
    HB.registerHelper('JSON', (s) => {
        return new HB.SafeString(_escapeHtml(JSON.stringify(s)));
    });
    HB.registerHelper('breaklines', (s) => {
        s = HB.Utils.escapeExpression(s);
        s = s.replace(/(\r\n|\n|\r)/gm, '<br>');
        return new HB.SafeString(s);
    });
    HB.registerHelper('url_encode', (str) => encodeURIComponent(str));

})(IRX);
