import { Link, useLocation } from 'react-router-dom';
import { Cctv, Activity, History, Moon, Sun, ShieldAlert, ChevronRight, BarChart3, Settings, HelpCircle, User } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from './ui/button.jsx';
import { Badge } from './ui/badge.jsx';

export default function Layout({ children }) {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const navItems = [
    { path: '/', icon: Activity, label: 'Dashboard' },
    { path: '/live', icon: Cctv, label: 'Live Monitor' },
    { path: '/incidents', icon: History, label: 'Incidents' },
  ];

  const secondaryItems = [
    { path: '#', icon: BarChart3, label: 'Analytics' },
    { path: '#', icon: Settings, label: 'Settings' },
    { path: '#', icon: HelpCircle, label: 'Support' },
  ];

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-gray-100 transition-colors duration-300">
      {/* Sidebar - Pro & Responsive */}
      <aside className="w-72 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex flex-col shadow-sm transition-colors duration-300">

        {/* Logo Section */}
        <div className="p-6 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight" data-testid="app-title">
                Sentinel
              </h1>
              <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">Academic Edition</p>
            </div>
          </div>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 px-4 py-6 overflow-y-auto" data-testid="sidebar-nav">
          <p className="px-4 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">Main Menu</p>
          <ul className="space-y-1 mb-8">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 ${isActive
                        ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-semibold shadow-sm border border-blue-100 dark:border-blue-500/20'
                        : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-200 font-medium'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-slate-500'}`} />
                      <span className="text-base">{item.label}</span>
                    </div>
                    {isActive && (
                      <ChevronRight className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="px-4 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">Utilities</p>
          <ul className="space-y-1">
            {secondaryItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <li key={idx}>
                  <Link
                    to={item.path}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-200 transition-all duration-200"
                  >
                    <Icon className="w-5 h-5 text-gray-500 dark:text-slate-500" />
                    <span className="text-base font-medium">{item.label}</span>
                    {item.label === 'Analytics' && (
                      <Badge variant="secondary" className="ml-auto bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700 text-xs font-normal">
                        Pro
                      </Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User / Footer Section */}
        <div className="p-4 border-t border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
              <User className="w-5 h-5 text-gray-600 dark:text-slate-400" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">Admin User</p>
              <p className="text-xs text-gray-500 dark:text-slate-500 truncate">admin@sentinel.ai</p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white shadow-sm bg-white dark:bg-slate-800"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            data-testid="theme-toggle"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 mr-2 text-yellow-500" /> : <Moon className="w-4 h-4 mr-2 text-blue-600" />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-white dark:bg-slate-950 transition-colors duration-300">
        {children}
      </main>
    </div>
  );
}
