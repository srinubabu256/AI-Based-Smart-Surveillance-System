import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import LiveMonitoring from './pages/LiveMonitoring';
import Incidents from './pages/Incidents';
import { Toaster } from 'sonner';
import './App.css';

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <BrowserRouter>
        <div className="App">
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/live" element={<LiveMonitoring />} />
              <Route path="/incidents" element={<Incidents />} />
            </Routes>
          </Layout>
          <Toaster position="top-right" richColors />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
