#include "xl-formula/evaluator.h"
#include <algorithm>
#include <cmath>
#include "xl-formula/functions.h"
#include "xl-formula/parser.h"

namespace xl_formula {

// FunctionRegistry implementation
void FunctionRegistry::registerFunction(const std::string& name, const FunctionImpl& impl) {
    std::string upper_name = name;
    std::transform(upper_name.begin(), upper_name.end(), upper_name.begin(), ::toupper);
    functions_[upper_name] = impl;
}

bool FunctionRegistry::hasFunction(const std::string& name) const {
    std::string upper_name = name;
    std::transform(upper_name.begin(), upper_name.end(), upper_name.begin(), ::toupper);

    // Check if it's a built-in function using perfect hash dispatcher
    Value test_result = functions::dispatcher::dispatch_builtin_function(upper_name, {}, Context());
    if (!test_result.isEmpty()) {
        return true;  // Built-in function exists
    }

    // Check custom functions
    return functions_.find(upper_name) != functions_.end();
}

Value FunctionRegistry::callFunction(const std::string& name, const std::vector<Value>& args,
                                     const Context& context) const {
    std::string upper_name = name;
    std::transform(upper_name.begin(), upper_name.end(), upper_name.begin(), ::toupper);

    try {
        // Try built-in function dispatcher first (ultra-fast perfect hash path)
        Value result = functions::dispatcher::dispatch_builtin_function(upper_name, args, context);
        if (!result.isEmpty()) {
            return result;  // Built-in function found and executed
        }

        // Fall back to custom function registry
        auto it = functions_.find(upper_name);
        if (it != functions_.end()) {
            return it->second(args, context);
        }

        return Value::error(ErrorType::NAME_ERROR);
    } catch (const std::exception&) {
        return Value::error(ErrorType::VALUE_ERROR);
    }
}

std::vector<std::string> FunctionRegistry::getFunctionNames() const {
    // Start with all built-in functions
    std::vector<std::string> names = functions::dispatcher::get_builtin_function_names();

    // Add custom functions
    names.reserve(names.size() + functions_.size());
    for (const auto& pair : functions_) {
        names.push_back(pair.first);
    }

    return names;
}

std::unique_ptr<FunctionRegistry> FunctionRegistry::createDefault() {
    // Built-in functions are handled by the dispatcher, so just create an empty registry for custom
    // functions
    return std::make_unique<FunctionRegistry>();
}

// Evaluator implementation
Evaluator::Evaluator(const Context& context, const FunctionRegistry* function_registry)
    : context_(&context), function_registry_(function_registry) {
    if (!function_registry_) {
        static auto default_registry = FunctionRegistry::createDefault();
        function_registry_ = default_registry.get();
    }
}

EvaluationResult Evaluator::evaluate(const ASTNode& node) {
    resetState();
    tracing_enabled_ = false;
    trace_stack_.clear();
    trace_root_.reset();

    try {
        // Use const_cast to work around visitor pattern const issues
        const_cast<ASTNode&>(node).accept(*this);

        EvaluationResult result(result_, warnings_);
        return result;
    } catch (const std::exception&) {
        return EvaluationResult::error(ErrorType::VALUE_ERROR);
    }
}

EvaluationResult Evaluator::evaluateWithTrace(const ASTNode& node, std::unique_ptr<TraceNode>& out_trace_root) {
    resetState();
    tracing_enabled_ = true;
    next_trace_id_ = 0;
    trace_stack_.clear();
    trace_root_.reset();

    try {
        const_cast<ASTNode&>(node).accept(*this);
        // hand over ownership of the trace tree
        out_trace_root = std::move(trace_root_);
        EvaluationResult result(result_, warnings_);
        return result;
    } catch (const std::exception&) {
        out_trace_root.reset();
        return EvaluationResult::error(ErrorType::VALUE_ERROR);
    }
}

TraceNode* Evaluator::beginTraceNode(const std::string& kind, const std::string& label) {
    if (!tracing_enabled_) return nullptr;
    auto node = std::make_unique<TraceNode>();
    node->id = next_trace_id_++;
    node->kind = kind;
    node->label = label;
    node->value = Value::empty();

    TraceNode* raw = node.get();
    if (trace_stack_.empty()) {
        trace_root_ = std::move(node);
    } else {
        trace_stack_.back()->children.push_back(std::move(node));
    }
    trace_stack_.push_back(raw);
    return raw;
}

void Evaluator::endTraceNode(TraceNode* node, const Value& value) {
    if (!tracing_enabled_ || trace_stack_.empty()) return;
    node->value = value;
    // Pop if this node is at the top
    if (trace_stack_.back() == node) {
        trace_stack_.pop_back();
    }
}

void Evaluator::visit(const LiteralNode& node) {
    TraceNode* t = beginTraceNode("Literal", node.getValue().toString());
    result_ = node.getValue();
    if (t) endTraceNode(t, result_);
}

void Evaluator::visit(const VariableNode& node) {
    TraceNode* t = beginTraceNode("Variable", node.getName());
    result_ = context_->getVariable(node.getName());
    if (result_.isEmpty()) {
        result_ = Value::error(ErrorType::NAME_ERROR);
    }
    if (t) endTraceNode(t, result_);
}

void Evaluator::visit(const BinaryOpNode& node) {
    TraceNode* t = beginTraceNode("BinaryOp", BinaryOpNode::operatorToString(node.getOperator()));
    // Evaluate left operand
    const_cast<ASTNode&>(node.getLeft()).accept(*this);
    Value left = result_;

    // Evaluate right operand
    const_cast<ASTNode&>(node.getRight()).accept(*this);
    Value right = result_;

    result_ = performBinaryOperation(node.getOperator(), left, right);
    if (t) endTraceNode(t, result_);
}

void Evaluator::visit(const UnaryOpNode& node) {
    std::string op = (node.getOperator() == UnaryOpNode::Operator::PLUS) ? "+" : "-";
    TraceNode* t = beginTraceNode("UnaryOp", op);
    const_cast<ASTNode&>(node.getOperand()).accept(*this);
    Value operand = result_;

    result_ = performUnaryOperation(node.getOperator(), operand);
    if (t) endTraceNode(t, result_);
}

void Evaluator::visit(const ArrayNode& node) {
    TraceNode* t = beginTraceNode("Array", "[ ]");
    // Arrays evaluate to a special array Value type
    // For now, we'll evaluate all elements and store them in a vector
    // This will be used by financial functions like IRR, NPV, MIRR
    std::vector<Value> elements;
    elements.reserve(node.getElements().size());

    for (const auto& element : node.getElements()) {
        const_cast<ASTNode&>(*element).accept(*this);
        elements.push_back(result_);
    }

    // Create an array Value - we need to add this to the Value class
    result_ = Value::array(elements);
    if (t) endTraceNode(t, result_);
}

void Evaluator::visit(const FunctionCallNode& node) {
    TraceNode* t = beginTraceNode("FunctionCall", node.getName());
    std::vector<Value> args;
    args.reserve(node.getArguments().size());

    // Evaluate all arguments
    for (const auto& arg : node.getArguments()) {
        const_cast<ASTNode&>(*arg).accept(*this);
        args.push_back(result_);
    }

    // Call function
    result_ = function_registry_->callFunction(node.getName(), args, *context_);
    if (t) endTraceNode(t, result_);
}

Value Evaluator::performBinaryOperation(BinaryOpNode::Operator op, const Value& left,
                                        const Value& right) {
    // Handle errors
    if (left.isError())
        return left;
    if (right.isError())
        return right;

    switch (op) {
        case BinaryOpNode::Operator::ADD: {
            if (left.canConvertToNumber() && right.canConvertToNumber()) {
                return Value(left.toNumber() + right.toNumber());
            }
            return Value::error(ErrorType::VALUE_ERROR);
        }

        case BinaryOpNode::Operator::SUBTRACT: {
            if (left.canConvertToNumber() && right.canConvertToNumber()) {
                return Value(left.toNumber() - right.toNumber());
            }
            return Value::error(ErrorType::VALUE_ERROR);
        }

        case BinaryOpNode::Operator::MULTIPLY: {
            if (left.canConvertToNumber() && right.canConvertToNumber()) {
                return Value(left.toNumber() * right.toNumber());
            }
            return Value::error(ErrorType::VALUE_ERROR);
        }

        case BinaryOpNode::Operator::DIVIDE: {
            if (left.canConvertToNumber() && right.canConvertToNumber()) {
                double divisor = right.toNumber();
                if (divisor == 0.0) {
                    return Value::error(ErrorType::DIV_ZERO);
                }
                return Value(left.toNumber() / divisor);
            }
            return Value::error(ErrorType::VALUE_ERROR);
        }

        case BinaryOpNode::Operator::POWER: {
            if (left.canConvertToNumber() && right.canConvertToNumber()) {
                double base = left.toNumber();
                double exponent = right.toNumber();
                double result = std::pow(base, exponent);
                if (std::isnan(result) || std::isinf(result)) {
                    return Value::error(ErrorType::NUM_ERROR);
                }
                return Value(result);
            }
            return Value::error(ErrorType::VALUE_ERROR);
        }

        case BinaryOpNode::Operator::CONCAT: {
            return Value(left.toString() + right.toString());
        }

        case BinaryOpNode::Operator::EQUAL: {
            return Value(left == right);
        }

        case BinaryOpNode::Operator::NOT_EQUAL: {
            return Value(left != right);
        }

        case BinaryOpNode::Operator::LESS_THAN: {
            return Value(left < right);
        }

        case BinaryOpNode::Operator::LESS_EQUAL: {
            return Value(left <= right);
        }

        case BinaryOpNode::Operator::GREATER_THAN: {
            return Value(left > right);
        }

        case BinaryOpNode::Operator::GREATER_EQUAL: {
            return Value(left >= right);
        }

        default:
            return Value::error(ErrorType::VALUE_ERROR);
    }
}

Value Evaluator::performUnaryOperation(UnaryOpNode::Operator op, const Value& operand) {
    if (operand.isError())
        return operand;

    switch (op) {
        case UnaryOpNode::Operator::PLUS: {
            if (operand.canConvertToNumber()) {
                return Value(operand.toNumber());
            }
            return Value::error(ErrorType::VALUE_ERROR);
        }

        case UnaryOpNode::Operator::MINUS: {
            if (operand.canConvertToNumber()) {
                return Value(-operand.toNumber());
            }
            return Value::error(ErrorType::VALUE_ERROR);
        }

        default:
            return Value::error(ErrorType::VALUE_ERROR);
    }
}

void Evaluator::resetState() {
    result_ = Value::empty();
    warnings_.clear();
}

}  // namespace xl_formula