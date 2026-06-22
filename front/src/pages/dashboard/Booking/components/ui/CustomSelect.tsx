import { useState, useRef, useEffect } from 'react'

interface Props {
  options: readonly string[]
  value: string
  onChange(v: string): void
}

export function CustomSelect({ options, value, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  return (
    <div ref={ref} className="cs-container">
      <div className={`cs-trigger${isOpen ? ' active' : ''}`} onClick={() => setIsOpen(o => !o)}>
        <span>{value}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="cs-arrow">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {isOpen && (
        <div className="cs-dropdown">
          {options.map(opt => (
            <div
              key={opt}
              className={`cs-option${opt === value ? ' selected' : ''}`}
              onClick={() => { onChange(opt); setIsOpen(false) }}
            >
              <span>{opt}</span>
              {opt === value && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="cs-check">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
