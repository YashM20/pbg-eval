import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <header className="top-nav">
        <NavLink to="/versions" className="top-nav__brand" onClick={() => setMenuOpen(false)}>
          PBG Eval
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
              Versions
            </NavLink>
          </li>
          <li>
            <NavLink to="/compare" onClick={() => setMenuOpen(false)}>
              Compare
            </NavLink>
          </li>
        </ul>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  )
}
