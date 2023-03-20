if(typeof globalThis !== 'undefined'){
    globalThis.IRX = globalThis;
}
if(!('IRX' in this)) this.IRX = {};
// TODO: remove irxGlobals alias
if (!('irxGlobals' in this)) this.irxGlobals = this.IRX;

