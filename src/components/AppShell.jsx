import { useEffect, useRef, useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ChevronRight,
  LogOut,
  X,
  Menu,
  Bell,
  Settings2,
  FileText, ScanLine,
} from "lucide-react";
import { availableModules, primaryNavigation, workspaceSection } from "../features/modules";
import { I } from "./icons";
import QuickSearch from "./QuickSearch";
import SceneSurface from "../features/cinema/SceneSurface";
import RouteCurtain from "../features/cinema/RouteCurtain";
import "./navigation-v2.css";
const navigationNotes = { overview: "Bugünün hikâyesi", fields: "Toprağın izini sür", architect: "Büyük resmi gör", twin: "Olasılıkları keşfet", "terra-brain": "Veriden anlayışa", flight: "Gökyüzünden sahaya", tasks: "Planla, uygula, izle", assistant: "Birlikte düşünelim" };
function illuminate(event) {
  if (event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const node = event.currentTarget, rect = node.getBoundingClientRect();
  node.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
  node.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
}
export default function AppShell({
  page,
  scene = page,
  user,
  fields,
  tasks,
  notifications = [],
  onNavigate,
  onField,
  onCreate,
  onLogout,
  children,
  workspace,
  organizationControl,
}) {
  const [mobile, setMobile] = useState(false),
    [slim, setSlim] = useState(() => {
      try {
        return localStorage.getItem("agromax.sidebar") === "slim";
      } catch {
        return false;
      }
    }),
    [search, setSearch] = useState(false);
  const [missionMenuExpanded,setMissionMenuExpanded] = useState(false);
  const compactNavigation = ["drones","architect"].includes(page) ? !missionMenuExpanded : slim;
  const menuButton = useRef(null),
    sidebar = useRef(null);
  const modules = availableModules(!!workspace);
  const section = workspaceSection(page);
  const active = modules.find((m) => m[0] === page) || modules[0],
    pending = tasks.filter((t) => !t.done).length;
  const roles = {
    owner: "İşletme sahibi",
    manager: "Yönetici",
    worker: "Ekip üyesi",
    viewer: "Görüntüleme",
  };
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("agromax.sidebar", slim ? "slim" : "full");
    } catch {}
  }, [slim]);
  useEffect(() => {
    if (!mobile) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector(".studio-mobile-close")?.focus();
    const close = (event) => {
      if (event.key === "Escape") {
        setMobile(false);
      }
      if (event.key === "Tab") {
        const targets = [
          ...(sidebar.current?.querySelectorAll("button, a[href]") || []),
        ].filter((node) => !node.disabled && node.getClientRects().length);
        const first = targets[0],
          last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const viewport = window.matchMedia("(min-width:641px)");
    const closeOnDesktop = () => {
      if (viewport.matches) setMobile(false);
    };
    viewport.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", close);
      viewport.removeEventListener("change", closeOnDesktop);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mobile]);
  function navigate(id) {
    onNavigate(id);
    setMobile(false);
  }
  const sidebarButton = ([id, label]) => {
    const entry = modules.find(([key]) => key === id);
    if (!entry) return null;
    const selected = page === id || section?.id === id;
    const Icon = I[entry[2]] || I.Sprout;
    return <button key={id} className={`studio-nav-link ${selected ? "is-active" : ""}`} onPointerMove={illuminate}
      title={label} aria-label={label} aria-current={selected ? "page" : undefined} onClick={() => navigate(id)}>
      <span className="canopy-nav-icon"><Icon size={19} aria-hidden="true" /></span>
      <span className="nav-copy"><span>{label}</span><small>{navigationNotes[id]}</small></span>
      {id === "tasks" && pending > 0 && <b>{pending}</b>}
    </button>;
  };
  return (
    <div
      className={`studio-shell cinematic-shell living-shell ${workspace ? "commercial-shell" : ""} ${compactNavigation ? "sidebar-slim" : ""} studio-page-${page}`}
    >
      <a
        className="workspace-skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        İçeriğe geç
      </a>
      {mobile && (
        <button
          className="studio-mobile-scrim"
          aria-label="Menüyü kapat"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        ref={sidebar}
        id="workspace-sidebar"
        className={`studio-sidebar ${mobile ? "is-open" : ""}`}
      >
        <div className="studio-brand-row">
          <button
            className="studio-brand"
            onClick={() => navigate("overview")}
            aria-label="Agromax ana ekran"
          >
            <img src="/brand/agromax-logo-light-v1.svg" alt="" width="161" height="38" />
          </button>
          <button
            className="studio-sidebar-collapse"
            onClick={() => ["drones","architect"].includes(page) ? setMissionMenuExpanded(!missionMenuExpanded) : setSlim(!slim)}
            aria-label={compactNavigation ? "Menüyü genişlet" : "Menüyü daralt"}
          >
            {compactNavigation ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <button
            className="studio-mobile-close"
            onClick={() => setMobile(false)}
            aria-label="Menüyü kapat"
          >
            <X size={20} />
          </button>
        </div>
        <div className="canopy-mobile-workspace">{organizationControl}</div>
        <div className="navigation-intro"><span>TOPRAKLA BAĞ KUR.</span><small>Gözlemden geleceğe</small></div>
        <nav className="studio-primary-nav" aria-label="Ana gezinme">
          {primaryNavigation.map(sidebarButton)}
        </nav>
        <div className="studio-sidebar-footer studio-utility-nav">
          <div className="studio-workspace">
            <span>{user.name.charAt(0).toLocaleUpperCase("tr-TR")}</span>
            <div><strong>{workspace?.name || "Benim işletmem"}</strong><small>{roles[workspace?.role] || "Kişisel çalışma alanı"}</small></div>
          </div>
          <button className="studio-nav-link" title="Bitki tanıma" aria-label="Bitki tanıma" onClick={() => navigate("plant-studio")}><ScanLine size={19}/><span>Bitki tanıma</span></button>
          <button className="studio-nav-link" title="Raporlar ve MRV" aria-label="Raporlar ve MRV" onClick={() => navigate(workspace ? "reports" : "mrv")}><FileText size={19}/><span>Raporlar ve MRV</span></button>
          <button className="studio-nav-link" title="İşletme ve ayarlar" aria-label="İşletme ve ayarlar" onClick={() => navigate(workspace ? "settings" : "integrations")}><Settings2 size={19}/><span>İşletme ve ayarlar</span></button>
          <a className="studio-nav-link" href="https://github.com/RumeliFatihi51/agromax-platform-upgrade/releases"
            target="_blank" rel="noreferrer"><PanelLeftOpen size={19}/><span>Windows uygulamasını indir</span></a>
          <div className="studio-user">
            <span className="studio-user-avatar">
              {user.name.charAt(0).toLocaleUpperCase("tr-TR")}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.guest ? "Bu tarayıcıdaki çalışma alanı" : "Çalışma alanım"}</small>
              {user.guest && <a href="?account=existing">Mevcut hesabı aç</a>}
            </div>
            {!user.guest && <button aria-label="Çıkış yap" title="Çıkış yap" onClick={onLogout}>
              <LogOut size={17} />
            </button>}
          </div>
        </div>
      </aside>
      <div className="studio-main">
        <header className="studio-topbar">
          <div className="studio-breadcrumb">
            <button
              className="studio-mobile-toggle"
              ref={menuButton}
              aria-label="Menüyü aç"
              aria-expanded={mobile}
              aria-controls="workspace-sidebar"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span className="canopy-topbar-label">Çalışma alanı</span>
            <ChevronRight size={13} />
            <strong>{active[1]}</strong>
          </div>
          <div className="studio-topbar-actions">
            {organizationControl}
            <button
              className="studio-global-search"
              aria-label="Hızlı erişim"
              onClick={() => setSearch(true)}
            >
              <Search size={17} />
              <span>Parsel, analiz, rapor ara…</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="studio-today">
              {new Date().toLocaleDateString("tr-TR", {
                timeZone: "Europe/Istanbul",
                day: "numeric",
                month: "long",
              })}
            </span>
            <button
              className="studio-calendar-button"
              aria-label={`Bildirimler${notifications ? `: ${notifications.filter((n) => !n.readAt).length} okunmamış` : ""}`}
              title="Bildirimleri aç"
              onClick={() => navigate("notifications")}
            >
              <Bell size={19} />
              {notifications?.some((n) => !n.readAt) && <i />}
            </button>
            <button
              className="studio-top-avatar"
              aria-label={
                workspace ? "Profil ayarlarını aç" : "Genel bakışı aç"
              }
              onClick={() => navigate(workspace ? "settings" : "overview")}
            >
              {user.name.charAt(0).toLocaleUpperCase("tr-TR")}
            </button>
          </div>
        </header>
        <main className="studio-content" id="main-content" tabIndex={-1}>
          {section && <nav className="workspace-section-nav" onPointerMove={illuminate} aria-label={section.label + " araçları"}>
            {section.pages.map(id => {
              const item = modules.find(([key]) => key === id);
              if (!item) return null;
              const label = { architect:"Projeler", "field-studio":"İmza 3D", fields:"Parseller", satellite:"Uydu kaynakları", temporal:"Arazi hafızası", history:"Analiz geçmişi", intelligence:"Tarla zekâsı", evidence:"Kanıtlar", contradictions:"Tutarlılık", investigation:"İncelemeler", scenarios:"Senaryolar", economics:"Karşılaştırma", finance:"Maliyet defteri", tasks:"Görevler", operations:"Sezon ve saha", prescriptions:"Reçeteler", drones:"Drone", mrv:"MRV", access:"Çevrimdışı erişim", platform:"Platform merkezi" }[id] || item[1];
              return <button key={id} onClick={() => navigate(id)} aria-current={id === page ? "page" : undefined}>{label}</button>;
            })}
          </nav>}
          <SceneSurface id={scene}>{children}</SceneSurface>
          <footer className="studio-page-footer">
            <span>
              Toprağı anla. <strong>Geleceği yetiştir.</strong>
            </span>
            <small>agromax · Çalışma alanınız</small>
            <a href="/visuals/films/tarim2/credits.txt" target="_blank" rel="noreferrer">Görsel kaynakları</a>
          </footer>
        </main>
      </div>
      <RouteCurtain id={`${page}:${scene || ""}`} label={active[1]} />
      <nav className="canopy-mobile-dock" aria-label="Hızlı gezinme">
        {[
          ["overview", "Ana ekran"],
          ["fields", "Parseller"],
          ["architect", "Architect"],
          ["tasks", "Saha"],
          ["assistant", "Filiz"],
        ].map(([id, label]) => {
          const entry = modules.find(([key]) => key === id);
          const Icon = I[entry[2]] || I.Sprout;
          return (
            <button
              key={id}
              aria-current={page === id || section?.id === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={21} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      {search && (
        <QuickSearch
          commercial={!!workspace}
          fields={fields}
          onNavigate={navigate}
          onField={onField}
          onClose={() => setSearch(false)}
        />
      )}
    </div>
  );
}
