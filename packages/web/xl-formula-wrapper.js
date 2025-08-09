/**
 * XL Formula JavaScript Wrapper
 * Provides a clean JavaScript API over the Emscripten-generated bindings
 */

let XLFormulaModule = null;

/**
 * Initialize the XL Formula library
 * @returns {Promise<boolean>} Promise that resolves when the library is ready
 */
async function initXLFormula() {
    if (XLFormulaModule) {
        return true;
    }

    try {
        const XLFormula = (await import('./xl-formula.js')).default;
        XLFormulaModule = await XLFormula();
        return true;
    } catch (error) {
        console.error('Failed to initialize XL Formula library:', error);
        return false;
    }
}

/**
 * Check if the library is initialized
 * @returns {boolean} True if the library is ready to use
 */
function isInitialized() {
    return XLFormulaModule !== null;
}

/**
 * Wrapper for Value class
 */
class Value {
    constructor(jsValue) {
        this._value = jsValue;
    }

    static number(value) {
        if (!isInitialized()) throw new Error('XL Formula not initialized');
        return new Value(XLFormulaModule.Value.fromNumber(value));
    }

    static text(value) {
        if (!isInitialized()) throw new Error('XL Formula not initialized');
        return new Value(XLFormulaModule.Value.fromText(value));
    }

    static boolean(value) {
        if (!isInitialized()) throw new Error('XL Formula not initialized');
        return new Value(XLFormulaModule.Value.fromBoolean(value));
    }

    static empty() {
        if (!isInitialized()) throw new Error('XL Formula not initialized');
        return new Value(XLFormulaModule.Value.empty());
    }

    static date(timestamp) {
        if (!isInitialized()) throw new Error('XL Formula not initialized');
        return new Value(XLFormulaModule.Value.fromDate(timestamp));
    }

    isNumber() { return this._value.isNumber(); }
    isText() { return this._value.isText(); }
    isBoolean() { return this._value.isBoolean(); }
    isError() { return this._value.isError(); }
    isEmpty() { return this._value.isEmpty(); }
    isDate() { return this._value.isDate(); }

    asNumber() { return this._value.asNumber(); }
    asText() { return this._value.asText(); }
    asBoolean() { return this._value.asBoolean(); }
    asDate() { 
        if (this.isDate()) {
            const timestamp = this._value.asDate();
            return new Date(timestamp * 1000);
        }
        throw new Error('Value is not a date');
    }
    getErrorText() { return this._value.getErrorText(); }
    getTypeName() { return this._value.getTypeName(); }

    toString() { return this.asText(); }
    valueOf() {
        if (this.isNumber()) return this.asNumber();
        if (this.isBoolean()) return this.asBoolean();
        return this.asText();
    }
}

/**
 * Wrapper for EvaluationResult class
 */
class EvaluationResult {
    constructor(jsResult) {
        this._result = jsResult;
    }

    isSuccess() { return this._result.isSuccess(); }
    hasError() { return this._result.hasError(); }

    getValue() {
        return new Value(this._result.getValue());
    }

    getErrorMessage() { return this._result.getErrorMessage(); }
    getErrors() { return this._result.getErrors(); }
}

/**
 * Wrapper for FormulaEngine class
 */
class FormulaEngine {
    constructor() {
        if (!isInitialized()) throw new Error('XL Formula not initialized');
        this._engine = new XLFormulaModule.FormulaEngine();
    }

    // Variable management
    setVariable(name, value) {
        if (value instanceof Value) {
            this._engine.setVariable(name, value._value);
        } else if (typeof value === 'number') {
            this._engine.setNumberVariable(name, value);
        } else if (typeof value === 'string') {
            this._engine.setTextVariable(name, value);
        } else if (typeof value === 'boolean') {
            this._engine.setBooleanVariable(name, value);
        } else {
            throw new Error('Invalid value type');
        }
        return this;
    }

    setNumber(name, value) {
        this._engine.setNumberVariable(name, value);
        return this;
    }

    setText(name, value) {
        this._engine.setTextVariable(name, value);
        return this;
    }

    setBoolean(name, value) {
        this._engine.setBooleanVariable(name, value);
        return this;
    }

    getVariable(name) {
        return new Value(this._engine.getVariable(name));
    }

    hasVariable(name) {
        return this._engine.hasVariable(name);
    }

    removeVariable(name) {
        this._engine.removeVariable(name);
        return this;
    }

    clearVariables() {
        this._engine.clearVariables();
        return this;
    }

    // Formula evaluation
    evaluate(formula) {
        return new EvaluationResult(this._engine.evaluate(normalizeFormula(formula)));
    }

    // Tooling-only: evaluate with trace for visualization
    evaluateWithTrace(formula) {
        try {
            if (typeof this._engine.evaluateWithTrace === 'function') {
                const obj = this._engine.evaluateWithTrace(normalizeFormula(formula));
                const result = new EvaluationResult(obj.result);
                const trace = obj.trace || null;
                return { result, trace };
            }
        } catch {}
        // Fallback for builds without trace support
        const fallback = this._engine.evaluate(normalizeFormula(formula));
        return { result: new EvaluationResult(fallback), trace: null };
    }
}

/**
 * Strip leading '=' from formula if present (Excel-style input)
 * @param {string} formula - The formula string
 * @returns {string} - Formula without leading '='
 */
function normalizeFormula(formula) {
    return formula.startsWith('=') ? formula.substring(1) : formula;
}

/**
 * Quick evaluation function
 */
function evaluate(formula) {
    if (!isInitialized()) throw new Error('XL Formula not initialized');
    return new EvaluationResult(XLFormulaModule.evaluate(normalizeFormula(formula)));
}

function getVersion() {
    if (!isInitialized()) throw new Error('XL Formula not initialized');
    return XLFormulaModule.getVersion();
}

// Export the API
const XLFormula = {
    init: initXLFormula,
    isInitialized,
    Value,
    EvaluationResult,
    FormulaEngine,
    evaluate,
    getVersion
};

// Support both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = XLFormula;
}

if (typeof window !== 'undefined') {
    window.XLFormula = XLFormula;
}

export default XLFormula;