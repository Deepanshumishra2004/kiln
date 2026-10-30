import { StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { PAGES, TRACKS } from "./pages";
import "./styles.css";

function useTheme() {
  const [theme, setTheme] = useState<string>(() => {
    try { return localStorage.getItem("theme") ?? "auto"; } catch { return "auto"; }
  });
  useEffect(() => {
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch { /* ignore */ }
  }, [theme]);
  const next = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
  return { theme, cycle: () => setTheme(next) };
}

function Sidebar(props: { open: boolean; close: () => void }) {
  const { theme, cycle } = useTheme();
  let n = 0;
  return (
    <nav className={`sidebar ${props.open ? "open" : ""}`}>
      <Link to="/welcome" className="brand" onClick={props.close}>
        <span className="logo">K</span> Kiln Learn
      </Link>
      <button className="btn theme-btn" onClick={cycle}>Theme: {theme}</button>
      {TRACKS.map((t) => (
        <div key={t}>
          <div className="track-title">{t}</div>
          {PAGES.filter((p) => p.track === t).map((p) => {
            n++;
            return (
              <NavLink key={p.slug} to={`/${p.slug}`} onClick={props.close}
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                <span className="num">{String(n).padStart(2, "0")}</span>
                <span>{p.title}</span>
              </NavLink>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Pager(props: { slug: string }) {
  const i = PAGES.findIndex((p) => p.slug === props.slug);
  const prev = PAGES[i - 1], next = PAGES[i + 1];
  return (
    <div className="pager">
      {prev ? <Link to={`/${prev.slug}`}><span className="dir">← Previous</span>{prev.title}</Link> : <span />}
      {next ? <Link to={`/${next.slug}`} style={{ textAlign: "right" }}><span className="dir">Next →</span>{next.title}</Link> : <span />}
    </div>
  );
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function App() {
  const [open, setOpen] = useState(false);
  return (
    <div className="app">
      <ScrollTop />
      <Sidebar open={open} close={() => setOpen(false)} />
      <div className="main">
        <div className="topbar">
          <button className="btn" onClick={() => setOpen(!open)}>☰ Lessons</button>
          <b>Kiln Learn</b>
        </div>
        <main className="content">
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <Routes>
              <Route path="/" element={<Navigate to="/welcome" replace />} />
              {PAGES.map(({ slug, Component }) => (
                <Route key={slug} path={`/${slug}`} element={<><Component /><Pager slug={slug} /></>} />
              ))}
              <Route path="*" element={<Navigate to="/welcome" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter><App /></HashRouter>
  </StrictMode>,
);
