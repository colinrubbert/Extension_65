
const excludeMethodNames = [
    '__defineGetter__',
    '__defineSetter__',
    'hasOwnProperty',
    '__lookupGetter__',
    '__lookupSetter__',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toString',
    'valueOf',
    'toLocaleString'
];

const getMethods = (obj) => {
    let properties = new Set();
    let currentObj = obj;
    do {
        Object.getOwnPropertyNames(currentObj).map(item => properties.add(item));
    } while ((currentObj = Object.getPrototypeOf(currentObj)));
    return [...properties.keys()].filter(item => typeof obj[item] === 'function' && !excludeMethodNames.includes(item));
};

function setupSpiesRecursively(o) {
    const propsAndFunctions = Array.from(new Set(getMethods(o).concat(Object.keys(o))));

    for (let i of propsAndFunctions) {
        if (typeof o[i] === 'function') {
            jest.spyOn(o, i);
        } else if (typeof o[i] === 'object') {
            setupSpiesRecursively(o[i]);
        }
    }

    return o;
}

module.exports = { setupSpiesRecursively };
