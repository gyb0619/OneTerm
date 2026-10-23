import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './shared/components/AppLayout';
import AuthPage from './features/auth';
import AdminPage from './features/admin';
import ExtractPage from './features/extract';
import CalendarPage from './features/calendar';
import QaPage from './features/qa';
import VisualizePage from './features/visualize';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/calendar" replace />} />
          <Route path="/extract" element={<ExtractPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/qa" element={<QaPage />} />
          <Route path="/visualize" element={<VisualizePage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
