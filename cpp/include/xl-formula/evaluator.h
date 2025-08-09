#pragma once

#include <functional>
#include <memory>
#include <unordered_map>
#include <vector>
#include <string>
#include "ast.h"
#include "types.h"

namespace xl_formula {

/**
 * @brief Function signature for built-in functions
 */
using FunctionImpl = std::function<Value(const std::vector<Value>&, const Context&)>;

/**
 * @brief Function registry with perfect hash dispatch for built-ins and dynamic registry for custom
 * functions
 *
 * Built-in functions are dispatched via a perfect hash for optimal performance.
 * Custom functions are stored in a dynamic hash map for flexibility.
 */
class FunctionRegistry {
  private:
    std::unordered_map<std::string, FunctionImpl> functions_;  // Custom functions only

  public:
    /**
     * @brief Register a custom function
     * @param name Function name (case-insensitive)
     * @param impl Function implementation
     */
    void registerFunction(const std::string& name, const FunctionImpl& impl);

    /**
     * @brief Check if a function exists (built-in or custom)
     * @param name Function name
     * @return true if function exists, false otherwise
     */
    bool hasFunction(const std::string& name) const;

    /**
     * @brief Call a function (built-in or custom)
     * @param name Function name
     * @param args Function arguments
     * @param context Evaluation context
     * @return Function result
     */
    Value callFunction(const std::string& name, const std::vector<Value>& args,
                       const Context& context) const;

    /**
     * @brief Get all function names (built-in and custom)
     * @return Vector of function names
     */
    std::vector<std::string> getFunctionNames() const;

    /**
     * @brief Create a default registry (built-ins handled via dispatcher, custom functions empty)
     * @return Default function registry
     */
    static std::unique_ptr<FunctionRegistry> createDefault();
};

/**
 * @brief Evaluation result containing value and any errors
 */
class EvaluationResult {
  private:
    Value value_;
    std::vector<std::string> warnings_;
    bool success_;

  public:
    EvaluationResult() : success_(false) {}
    EvaluationResult(const Value& value) : value_(value), success_(true) {}
    EvaluationResult(const Value& value, const std::vector<std::string>& warnings)
        : value_(value), warnings_(warnings), success_(true) {}

    bool isSuccess() const {
        return success_;
    }
    const Value& getValue() const {
        return value_;
    }
    const std::vector<std::string>& getWarnings() const {
        return warnings_;
    }

    void addWarning(const std::string& warning) {
        warnings_.push_back(warning);
    }

    static EvaluationResult error(ErrorType type) {
        EvaluationResult result;
        result.value_ = Value::error(type);
        result.success_ = false;
        return result;
    }
};

/**
 * @brief Trace node for evaluation visualization (built only when explicitly requested)
 */
struct TraceNode {
    int id;
    std::string kind;   // Literal, Variable, BinaryOp, UnaryOp, Array, FunctionCall
    std::string label;  // e.g., operator symbol, function name, variable name, literal text
    Value value;        // computed value for this node
    std::vector<std::unique_ptr<TraceNode>> children;
};

/**
 * @brief AST evaluator using visitor pattern
 */
class Evaluator : public ASTVisitor {
  private:
    const Context* context_;
    const FunctionRegistry* function_registry_;
    Value result_;
    std::vector<std::string> warnings_;

    // Trace state (enabled only for evaluateWithTrace)
    bool tracing_enabled_ = false;
    int next_trace_id_ = 0;
    std::vector<TraceNode*> trace_stack_;
    std::unique_ptr<TraceNode> trace_root_;

    Value performBinaryOperation(BinaryOpNode::Operator op, const Value& left, const Value& right);
    Value performUnaryOperation(UnaryOpNode::Operator op, const Value& operand);

    // Helper to create and push a trace node
    TraceNode* beginTraceNode(const std::string& kind, const std::string& label);
    void endTraceNode(TraceNode* node, const Value& value);

  public:
    /**
     * @brief Constructor
     * @param context Evaluation context for variable lookups
     * @param function_registry Registry for function calls (optional, uses default if null)
     */
    explicit Evaluator(const Context& context, const FunctionRegistry* function_registry = nullptr);

    /**
     * @brief Evaluate an AST node
     * @param node AST node to evaluate
     * @return Evaluation result
     */
    EvaluationResult evaluate(const ASTNode& node);

    /**
     * @brief Evaluate an AST node and build a trace tree for visualization
     * @param node AST node to evaluate
     * @param out_trace_root Output unique_ptr for the trace root node
     * @return Evaluation result
     */
    EvaluationResult evaluateWithTrace(const ASTNode& node, std::unique_ptr<TraceNode>& out_trace_root);

    // Visitor pattern implementation
    void visit(const LiteralNode& node) override;
    void visit(const VariableNode& node) override;
    void visit(const BinaryOpNode& node) override;
    void visit(const UnaryOpNode& node) override;
    void visit(const ArrayNode& node) override;
    void visit(const FunctionCallNode& node) override;

  private:
    void resetState();
};

/**
 * @brief High-level formula evaluation API
 */
class FormulaEngine {
  private:
    std::unique_ptr<FunctionRegistry> function_registry_;
    Context context_;

  public:
    FormulaEngine();
    ~FormulaEngine();

    /**
     * @brief Evaluate a formula string
     * @param formula Formula text to evaluate
     * @return Evaluation result
     */
    EvaluationResult evaluate(const std::string& formula);

    /**
     * @brief Evaluate a parsed AST
     * @param ast Parsed AST to evaluate
     * @return Evaluation result
     */
    EvaluationResult evaluate(const ASTNode& ast);

    /**
     * @brief Evaluate and produce a trace tree for visualization
     * @param formula Formula text to evaluate
     * @param out_trace_root Output unique_ptr for the trace root node
     * @return Evaluation result
     */
    EvaluationResult evaluateWithTrace(const std::string& formula, std::unique_ptr<TraceNode>& out_trace_root);

    /**
     * @brief Get the evaluation context
     * @return Reference to context
     */
    Context& getContext() {
        return context_;
    }
    const Context& getContext() const {
        return context_;
    }

    /**
     * @brief Get the function registry
     * @return Reference to function registry
     */
    FunctionRegistry& getFunctionRegistry() {
        return *function_registry_;
    }
    const FunctionRegistry& getFunctionRegistry() const {
        return *function_registry_;
    }

    /**
     * @brief Set a variable in the context
     * @param name Variable name
     * @param value Variable value
     */
    void setVariable(const std::string& name, const Value& value);

    /**
     * @brief Get a variable from the context
     * @param name Variable name
     * @return Variable value (empty if not found)
     */
    Value getVariable(const std::string& name) const;

    /**
     * @brief Register a custom function
     * @param name Function name
     * @param impl Function implementation
     */
    void registerFunction(const std::string& name, const FunctionImpl& impl);
};

}  // namespace xl_formula