import { useState, useEffect } from 'preact/hooks'
import { BenchmarkDiagnostic } from '../components/BenchmarkDiagnostic.jsx'

export function PlaygroundPage() {
  const [formula, setFormula] = useState('=SUM(1, 2, 3, 4, 5)')
  const [result, setResult] = useState('')
  const [resultType, setResultType] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [variables, setVariables] = useState([
    { name: 'A1', value: '10' },
    { name: 'B1', value: '20' },
    { name: 'C1', value: '30' }
  ])
  const [newVarName, setNewVarName] = useState('')
  const [newVarValue, setNewVarValue] = useState('')
  const [xlFormula, setXlFormula] = useState(null)
  const [engine, setEngine] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [savedFormulas, setSavedFormulas] = useState([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveFormulaName, setSaveFormulaName] = useState('')
  const [showDiagram, setShowDiagram] = useState(false)
  const [diagramSrc, setDiagramSrc] = useState('')

  // Load saved formulas from localStorage
  useEffect(() => {
    const savedData = localStorage.getItem('xl-formula-saved')
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        // Handle backward compatibility - convert old history entries
        const normalized = parsed.map(item => 
          typeof item === 'string' 
            ? { formula: item, name: null, variables: [], timestamp: new Date().toISOString() }
            : item
        )
        setSavedFormulas(normalized)
      } catch (error) {
        console.warn('Failed to parse saved formulas from localStorage', error)
      }
    } else {
      // Try to migrate from old history key
      const oldHistory = localStorage.getItem('xl-formula-history')
      if (oldHistory) {
        try {
          const parsed = JSON.parse(oldHistory)
          const normalized = parsed.map(item => 
            typeof item === 'string' 
              ? { formula: item, name: null, variables: [], timestamp: new Date().toISOString() }
              : item
          )
          setSavedFormulas(normalized)
          localStorage.setItem('xl-formula-saved', JSON.stringify(normalized))
          localStorage.removeItem('xl-formula-history') // Clean up old key
        } catch (error) {
          console.warn('Failed to migrate formula history', error)
        }
      }
    }
  }, [])

  // Save formula with optional name and variables
  const saveFormula = (formula, name = null) => {
    console.log('saveFormula called with:', { formula, name, variables })
    if (!formula || formula.trim() === '') {
      console.log('Formula is empty, not saving')
      return
    }
    
    const savedItem = {
      formula,
      name: name || null,
      variables: [...variables], // Save current variable state
      timestamp: new Date().toISOString()
    }
    
    console.log('Creating saved item:', savedItem)
    
    // Remove existing entry with same formula
    const newSaved = [savedItem, ...savedFormulas.filter(item => 
      (typeof item === 'string' ? item : item.formula) !== formula
    )].slice(0, 20) // Keep more saved formulas since they're intentional
    
    console.log('New saved formulas array:', newSaved)
    
    setSavedFormulas(newSaved)
    localStorage.setItem('xl-formula-saved', JSON.stringify(newSaved))
    console.log('Saved to localStorage:', localStorage.getItem('xl-formula-saved'))
  }

  useEffect(() => {
    initializeXLFormula()
  }, [])

  const initializeXLFormula = async () => {
    try {
      // Import from the workspace package using proper npm dependency
      const XLFormulaModule = await import('xl-formula-web')
      
      await XLFormulaModule.default.init()
      const formulaEngine = new XLFormulaModule.default.FormulaEngine()
      
      // Set initial variables
      variables.forEach(({ name, value }) => {
        formulaEngine.setVariable(name, parseValue(value))
      })
      
      setXlFormula(XLFormulaModule.default)
      setEngine(formulaEngine)
      setIsLoading(false)
      
      // Calculate initial formula
      calculateFormula(formula, formulaEngine)
    } catch (error) {
      console.error('Failed to initialize XL Formula:', error)
      setIsLoading(false)
      throw error // Don't fall back, we want to see real errors
    }
  }

  const parseValue = (valueStr) => {
    const num = parseFloat(valueStr)
    if (!isNaN(num) && isFinite(num)) return num
    
    const lower = valueStr.toLowerCase()
    if (lower === 'true' || lower === 'false') return lower === 'true'
    
    return valueStr
  }

  const calculateFormula = (formulaStr, formulaEngine = engine) => {
    if (!formulaEngine || !formulaStr.trim()) {
      setResult('')
      setResultType('empty')
      setIsSuccess(false)
      return
    }

    try {
      const evalResult = formulaEngine.evaluate(formulaStr)
      
      if (evalResult.isSuccess()) {
        const value = evalResult.getValue()
        setResult(formatValue(value))
        setResultType(value.getTypeName())
        setIsSuccess(true)
      } else {
        setResult(evalResult.getErrorMessage() || 'Unknown error')
        setResultType('error')
        setIsSuccess(false)
      }
    } catch (error) {
      setResult(`Error: ${error.message}`)
      setResultType('error')
      setIsSuccess(false)
    }
  }

  const formatValue = (value) => {
    if (value.isNumber()) {
      const num = value.asNumber()
      return Number.isInteger(num) ? num.toString() : num.toFixed(6).replace(/\.?0+$/, '')
    } else if (value.isBoolean()) {
      return value.asBoolean() ? 'TRUE' : 'FALSE'
    } else if (value.isError()) {
      return value.getErrorText()
    }
    return value.asText()
  }

  const addVariable = () => {
    if (!newVarName || !newVarValue) return
    
    const newVar = { name: newVarName, value: newVarValue }
    setVariables([...variables, newVar])
    
    if (engine) {
      engine.setVariable(newVarName, parseValue(newVarValue))
      calculateFormula(formula)
    }
    
    setNewVarName('')
    setNewVarValue('')
  }

  const removeVariable = (name) => {
    setVariables(variables.filter(v => v.name !== name))
    if (engine) {
      engine.removeVariable(name)
      calculateFormula(formula)
    }
  }

  const loadSavedFormula = (savedItem) => {
    console.log('Loading saved formula:', savedItem)
    const formula = typeof savedItem === 'string' ? savedItem : savedItem.formula
    const savedVariables = typeof savedItem === 'object' ? savedItem.variables : []
    
    console.log('Extracted formula:', formula, 'variables:', savedVariables)
    
    setFormula(formula)
    
    // Restore variables if they were saved
    if (savedVariables && savedVariables.length > 0) {
      console.log('Restoring variables:', savedVariables)
      setVariables(savedVariables)
      
      // Update engine with restored variables
      if (engine) {
        // Clear existing variables
        variables.forEach(v => {
          console.log('Removing variable:', v.name)
          engine.removeVariable(v.name)
        })
        // Set restored variables
        savedVariables.forEach(({ name, value }) => {
          console.log('Setting variable:', name, '=', value)
          engine.setVariable(name, parseValue(value))
        })
      }
    } else {
      console.log('No variables to restore')
    }
    
    calculateFormula(formula)
  }

  const tryExample = (exampleFormula) => {
    setFormula(exampleFormula)
    calculateFormula(exampleFormula)
    // Don't auto-save examples
  }

  const buildMermaidFromTrace = (trace) => {
    // Build a Mermaid flowchart graph from the trace tree
    // Use top-down nodes with ids trace.id
    const lines = ['flowchart TD']

    const nodeLabel = (n) => {
      // Prefer concise labels; include value for leaves
      const valueText = (() => {
        const val = n.value
        if (!val) return ''
        try {
          if (val.isError && val.isError()) return ` ${val.getErrorText()}`
          if (val.isNumber && val.isNumber()) return ` ${val.asNumber()}`
          if (val.isBoolean && val.isBoolean()) return ` ${val.asBoolean() ? 'TRUE' : 'FALSE'}`
          const txt = val.asText?.()
          if (typeof txt === 'string' && txt.length <= 12) return ` \"${txt}\"`
        } catch {}
        return ''
      })()
      return `${n.kind}:${n.label}${valueText}`
    }

    const visit = (n) => {
      const nodeId = `n${n.id}`
      const label = nodeLabel(n).replace(/"/g, '\\"')
      lines.push(`${nodeId}["${label}"]`)
      if (n.children && n.children.length) {
        for (const c of n.children) {
          const childId = `n${c.id}`
          visit(c)
          lines.push(`${nodeId} --> ${childId}`)
        }
      }
    }

    visit(trace)
    return lines.join('\n')
  }

  const generateDiagram = async () => {
    if (!engine) return
    try {
      const { result, trace } = engine.evaluateWithTrace(formula)
      if (!trace) {
        setDiagramSrc('')
        return
      }
      const src = buildMermaidFromTrace(trace)
      setDiagramSrc(src)
      // Lazy load mermaid and render via data-attr; mermaid will auto-render in useEffect below
      const { default: mermaid } = await import('mermaid')
      mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'neutral' })
      // Force re-render by next tick after state set
      setTimeout(() => {
        try {
          mermaid.init(undefined, '.mermaid')
        } catch (e) {
          console.warn('Mermaid init failed:', e)
        }
      }, 0)
    } catch (e) {
      console.error('Diagram generation failed', e)
      setDiagramSrc('')
    }
  }

  if (isLoading) {
    return (
      <div className="container" style={{ padding: '4rem 0', textAlign: 'center' }}>
        <div>Loading XL Formula engine...</div>
      </div>
    )
  }

  return (
    <div className="container" style={{ padding: '2rem 0' }}>
      <h1 className="text-2xl font-bold mb-6">Formula Playground</h1>
      {/* Formula Input */}
      <div className="card mb-6">
        <label className="label">Formula</label>
        <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
          <input
            type="text"
            value={formula}
            onChange={(e) => {
              setFormula(e.target.value)
              calculateFormula(e.target.value)
            }}
            className="input monospace flex-1"
            placeholder="Enter a formula like =SUM(1, 2, 3) or =A1 + B1"
            style={{ minWidth: '180px', flex: 1 }}
          />
          <button 
            onClick={() => {
              setShowSaveDialog(true)
            }}
            className="btn btn-sm"
            disabled={!formula.trim()}
            style={{ minWidth: '100px' }}
          >
            Save
          </button>
          <button
            onClick={() => {
              setShowDiagram(v => !v)
              if (!showDiagram) {
                // When opening, generate immediately
                setTimeout(() => generateDiagram(), 0)
              }
            }}
            className="btn btn-sm"
            style={{ minWidth: '140px' }}
          >
            {showDiagram ? 'Hide Diagram' : 'Show Diagram'}
          </button>
        </div>
        {/* Result with Performance */}
        <div className="p-4 rounded" style={{ 
          background: isSuccess ? 'var(--color-success-light)' : 'var(--color-error-light)',
          border: `1px solid ${isSuccess ? 'var(--color-success)' : 'var(--color-error)'}`,
          color: isSuccess ? 'var(--color-text)' : 'var(--color-text)',
          fontFamily: 'var(--font-mono)'
        }}>
          <div className="flex justify-between items-center" style={{ flexWrap: 'wrap' }}>
            <strong>Result:</strong>
            <span className="text-sm">{resultType}</span>
          </div>
          <div className="flex justify-between items-center" style={{ marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '1.1rem' }}>
              {result || 'Enter a formula to see the result'}
            </div>
            {/* Inline Performance Benchmark */}
            {result && (
              <div style={{ marginLeft: '1rem', minWidth: '120px' }}>
                <BenchmarkDiagnostic formula={formula} compact={true} />
              </div>
            )}
          </div>
        </div>
      </div>
      {showDiagram && (
        <div className="card mb-6">
          <div className="flex justify-between items-center mb-3" style={{ flexWrap: 'wrap' }}>
            <h3 className="font-semibold">Formula Evaluation Diagram</h3>
            <div className="flex gap-2">
              <button onClick={generateDiagram} className="btn btn-sm">Regenerate</button>
            </div>
          </div>
          <p className="text-sm text-muted">Visual breakdown of the formula into sub-expressions. Useful for troubleshooting complex formulas.</p>
          <div className="mermaid" style={{ overflowX: 'auto' }}>
            {diagramSrc ? diagramSrc : 'No diagram available'}
          </div>
        </div>
      )}
      {/* Saved Formulas */}
      {savedFormulas.length > 0 && (
        <div className="card mb-6">
          <div className="flex justify-between items-center mb-4" style={{ flexWrap: 'wrap' }}>
            <h3 className="font-semibold">Saved Formulas ({savedFormulas.length})</h3>
            <button
              onClick={() => {
                setSavedFormulas([])
                localStorage.removeItem('xl-formula-saved')
              }}
              className="btn btn-sm"
              style={{ fontSize: '0.75rem', minWidth: '100px' }}
            >
              Clear All
            </button>
          </div>
          <div className="grid gap-2">
            {savedFormulas.map((savedItem, index) => (
              <div 
                key={index}
                onClick={() => loadSavedFormula(savedItem)}
                className="p-3 rounded cursor-pointer flex justify-between items-center"
                style={{ 
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  flexWrap: 'wrap'
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
              >
                <div className="flex-1">
                  {savedItem.name && (
                    <div className="text-sm font-medium text-primary mb-1">{savedItem.name}</div>
                  )}
                  <div className="font-mono text-sm">{savedItem.formula}</div>
                  {savedItem.variables && savedItem.variables.length > 0 && (
                    <div className="text-xs text-muted mt-1">
                      Variables: {savedItem.variables.map(v => `${v.name}=${v.value}`).join(', ')}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const newSaved = savedFormulas.filter((_, i) => i !== index)
                    setSavedFormulas(newSaved)
                    localStorage.setItem('xl-formula-saved', JSON.stringify(newSaved))
                  }}
                  className="text-xs text-muted hover:text-error ml-2"
                  style={{ padding: '4px 8px', minWidth: '32px' }}
                  title="Delete saved formula"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-6" style={{ gap: '1rem' }}>
        {/* Variables */}
        <div className="card">
          <h3 className="font-semibold mb-4">Variables</h3>
          <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newVarName}
              onChange={(e) => setNewVarName(e.target.value)}
              placeholder="Variable name"
              className="input"
              style={{ minWidth: '100px', flex: 1 }}
            />
            <input
              type="text"
              value={newVarValue}
              onChange={(e) => setNewVarValue(e.target.value)}
              placeholder="Value"
              className="input"
              style={{ minWidth: '100px', flex: 1 }}
            />
            <button onClick={addVariable} className="btn btn-primary" style={{ minWidth: '80px' }}>
              Add
            </button>
          </div>
          <div className="grid gap-2">
            {variables.map((variable) => (
              <div key={variable.name} className="flex justify-between items-center p-2 rounded" style={{ background: 'var(--color-bg-secondary)', flexWrap: 'wrap' }}>
                <span className="font-mono font-medium">{variable.name}</span>
                <span className="font-mono text-muted">{variable.value}</span>
                <button 
                  onClick={() => removeVariable(variable.name)}
                  className="btn btn-sm"
                  style={{ background: 'var(--color-error)', color: 'white', border: 'none', minWidth: '60px' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
        {/* Examples */}
        <div className="card">
          <h3 className="font-semibold mb-4">Examples</h3>
          <div className="grid gap-3">
            {[
              { formula: '=SUM(1, 2, 3, 4, 5)', description: 'Basic sum function' },
              { formula: '=MAX(10, 20, 5, 30)', description: 'Find maximum value' },
              { formula: '=ROUND(3.14159, 2)', description: 'Round to 2 decimal places' },
              { formula: '=IF(5 > 3, "Yes", "No")', description: 'Conditional logic' },
              { formula: '=CONCATENATE("Hello", " ", "World")', description: 'Text concatenation' },
              { formula: '=A1 + B1 * C1', description: 'Using variables' }
            ].map((example, index) => (
              <div 
                key={index}
                onClick={() => tryExample(example.formula)}
                className="p-3 rounded cursor-pointer"
                style={{ 
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  flexWrap: 'wrap'
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
              >
                <div className="font-mono font-medium text-sm">{example.formula}</div>
                <div className="text-xs text-muted mt-1">{example.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Save Formula Dialog */}
      {showSaveDialog && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSaveDialog(false)
            }
          }}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '24px',
              width: '90vw',
              maxWidth: '400px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Save Formula</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                Formula Name (optional)
              </label>
              <input
                type="text"
                value={saveFormulaName}
                onChange={(e) => setSaveFormulaName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
                placeholder="e.g. 'Complex calculation', 'Tax formula'"
                autoFocus
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                Formula
              </label>
              <div style={{
                padding: '8px 12px',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '14px',
                overflowX: 'auto'
              }}>
                {formula}
              </div>
            </div>
            {variables.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                  Variables to Save
                </label>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  {variables.map(v => `${v.name}=${v.value}`).join(', ')}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button 
                onClick={() => setShowSaveDialog(false)} 
                className="btn btn-sm"
                style={{ backgroundColor: '#eee' }}
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  saveFormula(formula, saveFormulaName)
                  setShowSaveDialog(false)
                }} 
                className="btn btn-sm btn-primary"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}