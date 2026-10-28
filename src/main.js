// Website entry: Three.js from npm (exposed globally for the board module), Supabase backend, shared UI.
import * as THREE_NS from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './styles.css';
window.THREE = { ...THREE_NS, OrbitControls };
const { startApp } = await import('./ui.js');
const { supabaseBackend } = await import('./backend-supabase.js');
startApp(supabaseBackend({ url: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY }));
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
