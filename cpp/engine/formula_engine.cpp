#include "xl-formula/evaluator.h"
#include "xl-formula/parser.h"

namespace xl_formula {

// FormulaEngine implementation
FormulaEngine::FormulaEngine() {
    function_registry_ = FunctionRegistry::createDefault();
}

FormulaEngine::~FormulaEngine() = default;

EvaluationResult FormulaEngine::evaluate(const std::string& formula) {
    Parser parser;
    auto parse_result = parser.parse(formula);

    if (!parse_result.isSuccess()) {
        return EvaluationResult::error(ErrorType::PARSE_ERROR);
    }

    return evaluate(*parse_result.getAST());
}

EvaluationResult FormulaEngine::evaluate(const ASTNode& ast) {
    Evaluator evaluator(context_, function_registry_.get());
    return evaluator.evaluate(ast);
}

EvaluationResult FormulaEngine::evaluateWithTrace(const std::string& formula, std::unique_ptr<TraceNode>& out_trace_root) {
    Parser parser;
    auto parse_result = parser.parse(formula);

    if (!parse_result.isSuccess()) {
        out_trace_root.reset();
        return EvaluationResult::error(ErrorType::PARSE_ERROR);
    }

    Evaluator evaluator(context_, function_registry_.get());
    return evaluator.evaluateWithTrace(*parse_result.getAST(), out_trace_root);
}

void FormulaEngine::setVariable(const std::string& name, const Value& value) {
    context_.setVariable(name, value);
}

Value FormulaEngine::getVariable(const std::string& name) const {
    return context_.getVariable(name);
}

void FormulaEngine::registerFunction(const std::string& name, const FunctionImpl& impl) {
    function_registry_->registerFunction(name, impl);
}

}  // namespace xl_formula