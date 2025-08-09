import { useState, useEffect } from 'preact/hooks'
import { Parser } from 'hot-formula-parser'

export function BenchmarkDiagnostic({ formula = 'SUM(1,2,3,4,5)', compact = false }) {
  const [results, setResults] = useState({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    runDiagnostic()
  }, [formula])

  const handleRefresh = () => {
    runDiagnostic()
  }

  const runDiagnostic = async () => {
    setIsLoading(true)
    const diagnostic = {}

    try {
      // Test 1: Try to import XL Formula
      diagnostic.importTest = 'attempting...'
      try {
        const XLFormulaModule = await import('xl-formula-web')
        diagnostic.importTest = 'success'
        diagnostic.module = Object.keys(XLFormulaModule)
        
        // Test 2: Try to initialize
        diagnostic.initTest = 'attempting...'
        await XLFormulaModule.default.init()
        diagnostic.initTest = 'success'
        
        // Test 3: Try to calculate the user's formula
        diagnostic.calcTest = 'attempting...'
        const cleanFormula = formula.startsWith('=') ? formula.substring(1) : formula
        
        try {
          const result = XLFormulaModule.default.evaluate(cleanFormula)
          if (result.isSuccess()) {
            const value = result.getValue()
            diagnostic.calcTest = `success: ${value.asText()}`
            diagnostic.isReal = true
            
            // Test 4: Performance test with user's formula (only if formula is valid)
            const iterations = 10000
            const start = performance.now()
            for (let i = 0; i < iterations; i++) {
              XLFormulaModule.default.evaluate(cleanFormula)
            }
            const xlTime = performance.now() - start
            const xlAvgUs = (xlTime / iterations) * 1000
            const xlOpsPerSec = xlTime > 0 ? (iterations / (xlTime / 1000)) : null
            diagnostic.xlPerformance = `${xlTime.toFixed(3)}ms for ${iterations} iterations (${xlAvgUs.toFixed(3)} µs/iter${xlOpsPerSec ? `, ${Math.round(xlOpsPerSec).toLocaleString()} ops/s` : ''})`
          } else {
            diagnostic.calcTest = `failed: ${result.getErrorMessage()}`
            diagnostic.xlPerformance = 'Skipped (invalid formula)'
            diagnostic.isReal = false
          }
        } catch (formulaError) {
          diagnostic.calcTest = `failed: ${formulaError.message}`
          diagnostic.xlPerformance = 'Skipped (invalid formula)'
          diagnostic.isReal = false
        }
        
      } catch (error) {
        diagnostic.importTest = `failed: ${error.message}`
        diagnostic.error = error.toString()
        diagnostic.isReal = false
      }

      // Test hot-formula-parser for comparison
      try {
        const iterations = 10000
        const parser = new Parser()
        const cleanFormula = formula.startsWith('=') ? formula.substring(1) : formula
        
        // Test if formula is valid first
        const testResult = parser.parse(cleanFormula)
        if (testResult.error) {
          diagnostic.hotFormulaParserPerformance = `Skipped (${testResult.error})`
        } else {
          const start = performance.now()
          for (let i = 0; i < iterations; i++) {
            parser.parse(cleanFormula)
          }
          const hfpTime = performance.now() - start
          const hfpAvgUs = (hfpTime / iterations) * 1000
          const hfpOpsPerSec = hfpTime > 0 ? (iterations / (hfpTime / 1000)) : null
          diagnostic.hotFormulaParserPerformance = `${hfpTime.toFixed(3)}ms for ${iterations} iterations (${hfpAvgUs.toFixed(3)} µs/iter${hfpOpsPerSec ? `, ${Math.round(hfpOpsPerSec).toLocaleString()} ops/s` : ''})`
        }
      } catch (error) {
        diagnostic.hotFormulaParserError = error.toString()
      }

      // File system checks
      try {
        const response = await fetch('/packages/web/xl-formula.wasm')
        diagnostic.wasmFileCheck = response.ok ? 'accessible' : `failed: ${response.status}`
      } catch (error) {
        diagnostic.wasmFileCheck = `failed: ${error.message}`
      }

      try {
        const response = await fetch('/packages/web/xl-formula-wrapper.js')
        diagnostic.wrapperFileCheck = response.ok ? 'accessible' : `failed: ${response.status}`
      } catch (error) {
        diagnostic.wrapperFileCheck = `failed: ${error.message}`
      }

    } catch (error) {
      diagnostic.generalError = error.toString()
    }

    setResults(diagnostic)
    setIsLoading(false)
  }

  if (isLoading) {
    return <div>Running diagnostic...</div>
  }

  if (compact) {
    return (
      <div className="text-xs text-muted">
        {isLoading ? (
          <span>Benchmarking...</span>
        ) : (
          <>
            {results.error ? (
              <span>Benchmark error</span>
            ) : (
              <>
                {results.xlPerformance && results.hotFormulaParserPerformance && 
                 !results.xlPerformance.includes('Skipped') && 
                 !results.hotFormulaParserPerformance.includes('Skipped') && (
                  <div>
                    {(() => {
                      const xlTime = parseFloat(results.xlPerformance.match(/(\d+\.?\d*)/)?.[1] || '0')
                      const hfpTime = parseFloat(results.hotFormulaParserPerformance.match(/(\d+\.?\d*)/)?.[1] || '0')
                      const iterations = results.xlPerformance.match(/(\d+(?:,\d+)*) iterations/)?.[1] || '10000'
                      const speedup = hfpTime / xlTime
                      return (
                        <>
                          <div>XL Formula: {xlTime.toFixed(3)}ms • Hot Formula Parser: {hfpTime.toFixed(3)}ms ({iterations} iterations)</div>
                          <div className={speedup > 1 ? "text-success" : "text-error"}>
                            {speedup > 1 ? `${speedup.toFixed(1)}x faster` : `${(1/speedup).toFixed(1)}x slower`}
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )}
                {(results.calcTest?.includes('failed') || results.hotFormulaParserPerformance?.includes('Skipped')) && (
                  <span>Benchmark skipped</span>
                )}
              </>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">Performance Benchmark</h3>
        <button 
          onClick={handleRefresh} 
          className="btn btn-sm"
          disabled={isLoading}
        >
          {isLoading ? 'Running...' : 'Refresh'}
        </button>
      </div>
      <p className="text-sm text-muted mb-3">Formula: <code className="font-mono">{formula}</code></p>
      
      {results.error ? (
        <div className="p-3 rounded text-sm" style={{ background: 'var(--color-error-light)', color: 'var(--color-error)' }}>
          <strong>Error:</strong> {results.error}
        </div>
      ) : (
        <div className="grid gap-3">
          {results.xlPerformance && results.hotFormulaParserPerformance && (
            <>
              <div className="flex justify-between">
                <span>XL Formula:</span>
                <span className="font-mono">{results.xlPerformance}</span>
              </div>
              <div className="flex justify-between">
                <span>Hot Formula Parser:</span>
                <span className="font-mono">{results.hotFormulaParserPerformance}</span>
              </div>
              {results.xlPerformance && results.hotFormulaParserPerformance && 
               !results.xlPerformance.includes('Skipped') && 
               !results.hotFormulaParserPerformance.includes('Skipped') && (
                <div className="flex justify-between font-semibold pt-2 border-t">
                  <span>Performance:</span>
                  <span className="text-success">
                    {(() => {
                      const xlTime = parseFloat(results.xlPerformance.match(/(\d+\.?\d*)/)?.[1] || '0')
                      const hfpTime = parseFloat(results.hotFormulaParserPerformance.match(/(\d+\.?\d*)/)?.[1] || '0')
                      const speedup = hfpTime / xlTime
                      return speedup > 1 ? `${speedup.toFixed(1)}x faster` : `${(1/speedup).toFixed(1)}x slower`
                    })()}
                  </span>
                </div>
              )}
            </>
          )}
          {(results.calcTest?.includes('failed') || results.hotFormulaParserPerformance?.includes('Skipped')) && (
            <div className="text-sm text-muted">
              Invalid formula - benchmark skipped
            </div>
          )}
        </div>
      )}
    </div>
  )
}