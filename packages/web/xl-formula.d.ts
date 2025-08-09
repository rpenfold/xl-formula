/**
 * TypeScript definitions for XL Formula library
 */

export interface Value {
    isNumber(): boolean;
    isText(): boolean;
    isBoolean(): boolean;
    isError(): boolean;
    isEmpty(): boolean;
    isDate(): boolean;
    
    asNumber(): number;
    asText(): string;
    asBoolean(): boolean;
    getErrorText(): string;
    getTypeName(): string;
    
    toString(): string;
    valueOf(): number | boolean | string;
}

export interface ValueConstructor {
    new(): Value;
    number(value: number): Value;
    text(value: string): Value;
    boolean(value: boolean): Value;
    empty(): Value;
}

export interface EvaluationResult {
    isSuccess(): boolean;
    hasError(): boolean;
    getValue(): Value;
    getErrorMessage(): string;
    getErrors(): string[];
}

export interface TraceNode {
    id: number;
    kind: 'Literal' | 'Variable' | 'BinaryOp' | 'UnaryOp' | 'Array' | 'FunctionCall' | string;
    label: string;
    value: Value;
    children: TraceNode[];
}

export interface EvaluateWithTraceReturn {
    result: EvaluationResult;
    trace: TraceNode | null;
}

export interface FormulaEngine {
    // Variable management
    setVariable(name: string, value: Value | number | string | boolean): FormulaEngine;
    setNumber(name: string, value: number): FormulaEngine;
    setText(name: string, value: string): FormulaEngine;
    setBoolean(name: string, value: boolean): FormulaEngine;
    
    getVariable(name: string): Value;
    hasVariable(name: string): boolean;
    removeVariable(name: string): FormulaEngine;
    clearVariables(): FormulaEngine;
    
    // Formula evaluation (supports both '=FORMULA' and 'FORMULA' input)
    evaluate(formula: string): EvaluationResult;

    // Tooling-only evaluation with trace tree for visualization
    evaluateWithTrace(formula: string): EvaluateWithTraceReturn;
}

export interface FormulaEngineConstructor {
    new(): FormulaEngine;
}

export interface XLFormulaAPI {
    init(): Promise<boolean>;
    isInitialized(): boolean;
    
    Value: ValueConstructor;
    EvaluationResult: any; // Constructor not typically used directly
    FormulaEngine: FormulaEngineConstructor;
    
    // Quick evaluation function (supports both '=FORMULA' and 'FORMULA' input)
    evaluate(formula: string): EvaluationResult;
    
    getVersion(): string;
}

declare const XLFormula: XLFormulaAPI;
export default XLFormula;