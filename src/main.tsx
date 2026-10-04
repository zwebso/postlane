import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SendingApp } from './SendingApp';
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><SendingApp/></BrowserRouter></StrictMode>);
