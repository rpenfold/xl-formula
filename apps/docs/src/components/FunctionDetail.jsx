import { useState, useEffect } from 'preact/hooks'
import { Parser } from 'hot-formula-parser'

export function FunctionDetail({ func, category, categoryName }) {
  const [testFormula, setTestFormula] = useState(func.examples[0]?.formula || '')
  const [testResult, setTestResult] = useState('')
  const [xlFormula, setXlFormula] = useState(null)
  const [benchmarkResults, setBenchmarkResults] = useState(null)
  const [isBenchmarking, setIsBenchmarking] = useState(false)

  useEffect(() => {
    initializeXLFormula()
  }, [])

  useEffect(() => {
    if (xlFormula && testFormula) {
      runTest()
    }
  }, [testFormula, xlFormula])

  const initializeXLFormula = async () => {
    try {
      // Import from the workspace package using proper npm dependency
      const XLFormulaModule = await import('xl-formula-web')
      console.log('🔍 XL Formula module loaded:', XLFormulaModule)
      
      await XLFormulaModule.default.init()
      console.log('🔍 XL Formula initialized successfully')
      
      // Create a FormulaEngine instance (this is the key difference!)
      const engine = new XLFormulaModule.default.FormulaEngine()
      console.log('🔍 FormulaEngine created:', engine)
      
      // Test that it's actually working
      const testResult = engine.evaluate('SUM(1,2,3)')
      if (testResult.isSuccess()) {
        const testValue = testResult.getValue()
        console.log('🔍 XL Formula test result:', testValue.asNumber())
      }
      
      // Test NOW() specifically
      try {
        const nowResult = engine.evaluate('NOW()')
        if (nowResult.isSuccess()) {
          const nowValue = nowResult.getValue()
          console.log('🔍 NOW() test result:', nowValue.asText())
        }
      } catch (error) {
        console.error('🔍 NOW() test failed:', error)
      }
      
      setXlFormula(engine)
    } catch (error) {
      console.error('🔍 Failed to initialize XL Formula:', error)
      throw error // Don't fall back to mock, we want to see real errors
    }
  }

  const runTest = () => {
    if (!xlFormula || !testFormula) return

    try {
      const cleanFormula = testFormula.startsWith('=') ? testFormula.substring(1) : testFormula

      console.log('🔍 FunctionDetail runTest:', {
        formula: cleanFormula,
        xlFormula: xlFormula,
        hasEvaluate: typeof xlFormula.evaluate === 'function'
      })

      // Use the proper evaluate() method that returns the correct type
      const evalResult = xlFormula.evaluate(cleanFormula)
      
      if (evalResult.isSuccess()) {
        const value = evalResult.getValue()
        const result = formatValue(value)
        console.log('🔍 evaluate result:', result, 'Type:', value.getTypeName())
        setTestResult(String(result))
      } else {
        const errorMsg = evalResult.getErrorMessage() || 'Unknown error'
        console.error('🔍 evaluate error:', errorMsg)
        setTestResult(`Error: ${errorMsg}`)
      }
    } catch (error) {
      console.error('🔍 FunctionDetail error:', error)
      setTestResult(`Error: ${error.message}`)
    }
  }

  // Format value based on its actual type (same as playground)
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

  const runBenchmark = async () => {
    if (!xlFormula || !testFormula) return

    setIsBenchmarking(true)
    setBenchmarkResults(null)

    try {
      const iterations = 100000
      const cleanFormula = testFormula.startsWith('=') ? testFormula.substring(1) : testFormula

      console.log('Running benchmark with XL Formula implementation')
      console.log('Formula:', cleanFormula)
      
      // Warm up both implementations
      xlFormula.evaluate(cleanFormula)
      
      // Benchmark XL Formula
      const xlStart = performance.now()
      let xlResult
      for (let i = 0; i < iterations; i++) {
        const result = xlFormula.evaluate(cleanFormula)
        if (result.isSuccess()) {
          xlResult = result.getValue()
        }
      }
      const xlTime = performance.now() - xlStart
      console.log('XL Formula result:', xlResult, 'Time:', xlTime, 'ms')

      // Benchmark hot-formula-parser
      let hotFormulaTime = null
      let hotFormulaResult = null
      try {
        // Create Parser instance
        const parser = new Parser()
        
        // Get the result for comparison
        const parseResult = parser.parse(cleanFormula)
        hotFormulaResult = parseResult.error ? null : parseResult.result
        console.log('Hot-formula-parser args:', cleanFormula)
        console.log('Hot-formula-parser parse result:', parseResult)
        
        // Warm up hot-formula-parser
        parser.parse(cleanFormula)
        
        const hfpStart = performance.now()
        for (let i = 0; i < iterations; i++) {
          parser.parse(cleanFormula)
        }
        hotFormulaTime = performance.now() - hfpStart
        console.log('Hot-formula-parser result:', hotFormulaResult, 'Time:', hotFormulaTime, 'ms')
      } catch (error) {
        console.warn('Hot-formula-parser benchmark failed:', error)
      }

      // Compute per-iteration averages and throughput
      const xlAvgMs = xlTime / iterations
      const xlAvgUs = xlAvgMs * 1000
      const xlOpsPerSec = xlTime > 0 ? (iterations / (xlTime / 1000)) : null

      const hfpAvgMs = hotFormulaTime != null ? (hotFormulaTime / iterations) : null
      const hfpAvgUs = hfpAvgMs != null ? (hfpAvgMs * 1000) : null
      const hfpOpsPerSec = hotFormulaTime > 0 ? (iterations / (hotFormulaTime / 1000)) : null

      // Verify results match (handle different data types)
      let resultsMatch = false
      if (hotFormulaResult !== null) {
        if (typeof xlResult === 'number' && typeof hotFormulaResult === 'number') {
          resultsMatch = Math.abs(xlResult - hotFormulaResult) < 0.001
        } else {
          resultsMatch = String(xlResult) === String(hotFormulaResult)
        }
      }
      
      if (!resultsMatch && hotFormulaResult !== null) {
        console.warn('Results don\'t match! XL:', xlResult, '(', typeof xlResult, ') Hot-formula-parser:', hotFormulaResult, '(', typeof hotFormulaResult, ')')
      }

      setBenchmarkResults({
        xlFormula: xlTime,
        hotFormulaParser: hotFormulaTime,
        iterations,
        speedup: hotFormulaTime ? (hotFormulaTime / xlTime).toFixed(2) : null,
        xlResult,
        hotFormulaResult,
        resultsMatch: hotFormulaResult !== null ? resultsMatch : null,
        // Added precision metrics
        xlAvgUs,
        xlOpsPerSec,
        hfpAvgUs,
        hfpOpsPerSec,
      })
    } catch (error) {
      console.error('Benchmark failed:', error)
      setBenchmarkResults({
        error: error.message,
        xlFormula: null,
        hotFormulaParser: null,
        iterations: 0,
        speedup: null
      })
    } finally {
      setIsBenchmarking(false)
    }
  }

  return (
    <div>
      {/* Function Header */}
      <div style={{ marginBottom: '2rem' }}>
                  <div style={{ marginBottom: '0.25rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0' }}>
              <span className="text-xs rounded" style={{ 
                background: 'var(--color-primary-light)', 
                color: 'var(--color-primary)',
                padding: '2px 8px'
              }}>
                {categoryName}
              </span>
            </div>
            <h1 className="text-3xl font-mono font-bold" style={{ overflowWrap: 'anywhere' }}>{func.name}</h1>
          </div>
        <p className="text-lg text-muted">{func.description}</p>
      </div>
      <div className="grid grid-cols-2 gap-8" style={{ gap: '1rem' }}>
        {/* Documentation */}
        <div>
          {/* Syntax & Parameters */}
          <div className="card mb-6">
            <h3 className="font-semibold mb-4">Syntax & Parameters</h3>
            {/* Syntax */}
            <div className="mb-4">
              <div className="text-sm font-medium mb-2">Syntax</div>
              <div className="font-mono p-3 rounded" style={{ background: 'var(--color-bg-secondary)', overflowX: 'auto' }}>
                {func.syntax}
              </div>
            </div>
            {/* Parameters */}
            <div>
              <div className="text-sm font-medium mb-3">Parameters</div>
              {func.parameters.length > 0 ? (
                <div className="grid gap-3">
                  {func.parameters.map((param, index) => (
                    <div key={index} className="flex gap-3" style={{ flexWrap: 'wrap' }}>
                      <div className="font-mono text-sm font-medium" style={{ minWidth: '100px' }}>
                        {param.name}
                        {param.required && <span className="text-error">*</span>}
                      </div>
                      <div className="text-sm text-muted">{param.description}</div>
                    </div>
                  ))}
                  <div className="text-xs text-muted mt-2">
                    * Required parameter
                  </div>
                </div>
              ) : (
                <p className="text-muted text-sm">This function takes no parameters.</p>
              )}
            </div>
          </div>
          {/* Examples */}
          <div className="card">
            <h3 className="font-semibold mb-3">Examples</h3>
            <div className="grid gap-4">
              {func.examples.map((example, index) => (
                <div key={index} className="p-3 rounded" style={{ background: 'var(--color-bg-secondary)', overflowX: 'auto' }}>
                  <div className="flex justify-between items-start mb-2" style={{ flexWrap: 'wrap' }}>
                    <code className="font-mono text-sm">{example.formula}</code>
                    <span className="text-sm text-success">{example.result}</span>
                  </div>
                  <div className="text-xs text-muted">{example.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Interactive Sandbox */}
        <div>
          {/* Try It Out */}
          <div className="card mb-6">
            <h3 className="font-semibold mb-3">Try It Out</h3>
            <label className="label">Formula</label>
            <input
              type="text"
              value={testFormula}
              onChange={(e) => setTestFormula(e.target.value)}
              className="input monospace mb-3"
              placeholder="Enter a formula to test"
              style={{ minWidth: '180px', width: '100%' }}
            />
            <div className="p-3 rounded" style={{ 
              background: 'var(--color-success-light)', 
              border: '1px solid var(--color-success)',
              color: 'var(--color-text)',
              overflowX: 'auto'
            }}>
              <div className="flex justify-between items-center" style={{ flexWrap: 'wrap' }}>
                <strong>Result:</strong>
                <button onClick={runTest} className="btn btn-sm">
                  Run Test
                </button>
              </div>
              <div className="font-mono mt-2">
                {testResult || 'Click "Run Test" to see result'}
              </div>
            </div>
            <div className="mt-4">
              <h4 className="font-medium mb-2">Quick Examples</h4>
              <div className="grid gap-2">
                {func.examples.map((example, index) => (
                  <button
                    key={index}
                    onClick={() => setTestFormula(example.formula)}
                    className="btn btn-sm text-left"
                    style={{ justifyContent: 'flex-start', width: '100%' }}
                  >
                    <code className="font-mono text-xs">{example.formula}</code>
                  </button>
                ))}
              </div>
            </div>
          </div>
          {/* Benchmark */}
          <div className="card">
            <h3 className="font-semibold mb-3">Performance Benchmark</h3>
            <p className="text-sm text-muted mb-4">
              Compare XL Formula performance against Hot Formula Parser
            </p>
            <button
              onClick={runBenchmark}
              disabled={isBenchmarking || !testFormula}
              className="btn btn-primary mb-4"
              style={{ width: '100%' }}
            >
              {isBenchmarking ? 'Running Benchmark...' : 'Run Benchmark'}
            </button>
            {benchmarkResults && (
              <div className="grid gap-3">
                {benchmarkResults.error ? (
                  <div className="p-3 rounded" style={{ background: 'var(--color-error-light)', color: 'var(--color-error)' }}>
                    <strong>Benchmark Error:</strong> {benchmarkResults.error}
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>XL Formula:</span>
                      <span className="font-mono">
                        {benchmarkResults.xlFormula ? `${benchmarkResults.xlFormula.toFixed(3)}ms` : 'N/A'}
                        {benchmarkResults.xlAvgUs != null && (
                          <>
                            {` (`}
                            {`${benchmarkResults.xlAvgUs.toFixed(3)} µs/iter`}
                            {benchmarkResults.xlOpsPerSec ? `, ${Math.round(benchmarkResults.xlOpsPerSec).toLocaleString()} ops/s` : ''}
                            {`)`}
                          </>
                        )}
                      </span>
                    </div>
                    {benchmarkResults.hotFormulaParser && (
                      <>
                        <div className="flex justify-between">
                          <span>Hot Formula Parser:</span>
                          <span className="font-mono">
                            {benchmarkResults.hotFormulaParser.toFixed(3)}ms
                            {benchmarkResults.hfpAvgUs != null && (
                              <>
                                {` (`}
                                {`${benchmarkResults.hfpAvgUs.toFixed(3)} µs/iter`}
                                {benchmarkResults.hfpOpsPerSec ? `, ${Math.round(benchmarkResults.hfpOpsPerSec).toLocaleString()} ops/s` : ''}
                                {`)`}
                              </>
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between font-semibold">
                          <span>Speedup:</span>
                          <span className={benchmarkResults.speedup > 1 ? "text-success" : "text-error"}>
                            {benchmarkResults.speedup > 1 ? `${benchmarkResults.speedup}x faster` : `${(1/parseFloat(benchmarkResults.speedup)).toFixed(2)}x slower`}
                          </span>
                        </div>
                      </>
                    )}
                    {benchmarkResults.resultsMatch !== null && (
                      <div className="flex justify-between text-xs">
                        <span>Results match:</span>
                        <span className={benchmarkResults.resultsMatch ? "text-success" : "text-error"}>
                          {benchmarkResults.resultsMatch ? '✓ Yes' : '✗ No'} 
                          {!benchmarkResults.resultsMatch && ` (XL: ${benchmarkResults.xlResult}, HFP: ${benchmarkResults.hotFormulaResult})`}
                        </span>
                      </div>
                    )}
                    <div className="text-xs text-muted">
                      Tested with {benchmarkResults.iterations.toLocaleString()} iterations
                    </div>
                  </>
                )}
              </div>
            )}
            {!benchmarkResults && !isBenchmarking && (
              <div className="text-sm text-muted">
                Enter a formula above and click "Run Benchmark" to compare performance against Hot Formula Parser.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}