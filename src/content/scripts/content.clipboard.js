/* globals IRX */

(async (globals) => {

    let _forCopySelectInput = (input) => {
        if (input.tagName.toLowerCase() == 'div') {
            let range = document.createRange();
            range.selectNodeContents(input);
            let sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        } else {
            input.select();
        }
    };

    let _forCopyInput = (isHtml, val = null, copy = false) => {
        let hideStyle = 'width:0; height: 0; overflow: hidden;',
            input;
        if (isHtml) {
            input = document.createElement('div');
            input.contentEditable = true;
            input.innerHTML = val;
            input.setAttribute('style', hideStyle);
            document.body.appendChild(input);
            input.focus();
            _forCopySelectInput(input);
        } else {
            input = document.createElement('textarea');
            input.setAttribute('style', hideStyle);
            input.value = val;
            document.body.appendChild(input);
            input.focus();
            _forCopySelectInput(input);
        }
        if (copy) {
            document.execCommand('copy');
        } else {
            document.execCommand('paste');
        }
        return input;
    };

    function _copyToClipboard(val) {
        let isHtml = (/<br[\/]?>|<p>|<span>|<b>|<i>/i).test(val);
        let input = _forCopyInput(isHtml, val, true); // copy val to clipboard
        input.remove();
    }

    globals.RELAY.on('copy.clipboard', data => {
        _copyToClipboard(data.value);
    });

})(IRX);
