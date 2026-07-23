import { useState, useRef, useEffect } from 'react'

export interface CustomSelectOption<V extends string | number = string | number> {
  value: V
  label: string
}

interface Props<V extends string | number> {
  options: readonly CustomSelectOption<V>[]
  value: V
  onChange(v: V): void
}

export function CustomSelect<V extends string | number>({ options, value, onChange }: Props<V>) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  useEffect(() => {
    if (!isOpen || !dropdownRef.current || !selectedRef.current) return

    const dropdown = dropdownRef.current
    const selectedOption = selectedRef.current
    dropdown.scrollTop = selectedOption.offsetTop - (dropdown.clientHeight - selectedOption.offsetHeight) / 2
  }, [isOpen])

  return (
    <div ref={ref} className="cs-container">
      <div className={`cs-trigger${isOpen ? ' active' : ''}`} onClick={() => setIsOpen(o => !o)}>
        <span>{selected?.label ?? ''}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="cs-arrow">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {isOpen && (
        <div ref={dropdownRef} className="cs-dropdown">
          {options.map(opt => (
            <div
              key={opt.value}
              ref={opt.value === value ? selectedRef : undefined}
              className={`cs-option${opt.value === value ? ' selected' : ''}`}
              onClick={() => { onChange(opt.value); setIsOpen(false) }}
            >
              <span>{opt.label}</span>
              {opt.value === value && (
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
