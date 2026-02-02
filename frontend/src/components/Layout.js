import { Link, useLocation } from 'react-router-dom';
import { CCTV, Activity, History, Moon, Sun, ShieldAlert } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from './ui/button';

export default function Layout({ children }) {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const navItems = [
    { path: '/', icon: Activity, label: 'Dashboard' },
    { path: '/live', icon: CCTV, label: 'Live Monitor' },
    { path: '/incidents', icon: History, label: 'Incidents' },
  ];

  return (
    <div className="flex h-screen bg-surface">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-primary flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground" data-testid="app-title">Sentinel</h1>
              <p className="text-xs text-muted-foreground">Academic Edition</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4" data-testid="sidebar-nav">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors duration-200 ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium text-sm">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            data-testid="theme-toggle"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
