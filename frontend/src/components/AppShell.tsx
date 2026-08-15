import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <header className="top-nav">
        <NavLink to="/versions" className="top-nav__brand" onClick={() => setMenuOpen(false)}>
          PBG Eval <span style={{ fontSize: '0.75rem', color: 'var(--color-accent-teal)', fontWeight: 400 }}>v0.5.0</span>
        </NavLink>
        <button
          type="button"
          className="nav-toggle"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          Menu
        </button>
        <ul className={`top-nav__links${menuOpen ? ' open' : ''}`}>
          <li>
            <NavLink to="/versions" onClick={() => setMenuOpen(false)}>
              Evaluation Hub
            </NavLink>
          </li>
          <li>
            <NavLink to="/compare" onClick={() => setMenuOpen(false)}>
              Version Compare
            </NavLink>
          </li>
          <li>
            <NavLink to="/studio" onClick={() => setMenuOpen(false)}>
              Prompt Studio & Auto
            </NavLink>
          </li>
          <li>
            <NavLink to="/synthetic" onClick={() => setMenuOpen(false)}>
              Synthetic Lab
            </NavLink>
          </li>
          <li>
            <a
              href="/api/gates/export/html"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--color-accent-teal)', fontSize: '0.85rem' }}
            >
              Export Report ↗
            </a>
          </li>
        </ul>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  )
}
