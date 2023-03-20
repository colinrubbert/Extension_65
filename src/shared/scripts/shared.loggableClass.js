/* globals IRX */

((IRX) => {

    const LOG_ALL = false;

    class LoggableClass{
        _logging;
        #_debugColor;

        constructor(debug, recordLogs= true){
            this._logging = {debug, classLogName: this.constructor.name, recordLogs};
        }

        getEnv(){
            return new Promise(async (resolve) => {
                resolve(await IRX.storeUtils.get('env') || 'production');
            });
        }

        #debugColor(klass){
            const possibleColors = ['#C0392B','#633974','#1A5276','#0E6655','#196F3D','#9A7D0A','#935116','#34495E',
                '#E74C3C','#A569BD','#3498DB','#1ABC9C','#58D68D','#F39C12','#DC7633'];
            this.#_debugColor = this.#_debugColor || possibleColors[Math.floor(Math.random()*possibleColors.length)];
            return this.#_debugColor;
        }

        #debugConsole(){
            if((!('LOGGER' in IRX) || !this._logging.debug) && !LOG_ALL) return;
            const level = IRX.LOGGER.level;
            const infoArgs = [
                `%cIRX%c[${this._logging.classLogName}]%c${level}`,
                'font-weight: bold; color: black; background: #f2f2f2; padding: 4px;',
                `font-weight: bold; background: #f2f2f2; padding: 4px; color: ${this.#debugColor()};`,
                'font-weight: bold; color: #5c5c5c; background: #f2f2f2; padding: 4px;',
            ];
            const allArgs = infoArgs.concat(Array.from(arguments));
            console.log(...allArgs);
        }

        log(...args) {
            if(this._logging.recordLogs) {
                if ('LOGGER' in IRX) IRX.LOGGER.log(this._logging.classLogName, this._logging.debug, ...args);
            }
            this.#debugConsole(...args);
        }

        // for log NO STORE we just do console output but only write the FIRST argument to the store
        logNoStore(...args){
            if(this._logging.recordLogs) {
                if ('LOGGER' in IRX) IRX.LOGGER.log(this._logging.classLogName, this._logging.debug, args[0]);
            }
            this.#debugConsole(...args);
        }
    }

    IRX.LoggableClass = IRX.LoggableClass || LoggableClass;

})(IRX);
