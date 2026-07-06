// Importamos los módulos base directamente desde el CDN oficial de Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
// 1. Importamos la librería específica de Analytics
import { getAnalytics, logEvent } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js';

// Tu configuración de Firebase (Asegúrate de actualizarla con tus datos reales)
const firebaseConfig = {
  apiKey: "AIzaSyCg8H7Zvf4MgqPljRmsjVSgjtXl2UPh6sI",
  authDomain: "bicfinance.firebaseapp.com",
  projectId: "bicfinance",
  storageBucket: "bicfinance.firebasestorage.app",
  messagingSenderId: "238902535603",
  appId: "1:238902535603:web:bfc0f7d88408a827bad7c6",
  measurementId: "G-CVXHRMLNK3" // <-- ¡Vital para que funcione el monitoreo!
};

// Inicializamos la aplicación de Firebase
const app = initializeApp(firebaseConfig);

// Exportamos las herramientas para que las uses en tu lógica de app.js
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);

// 2. Inicializamos Analytics
export const analytics = getAnalytics(app);

/**
 * Función personalizada para registrar eventos manualmente en tu Dashboard
 * @param {string} nombreEvento - Ejemplo: 'gasto_creado', 'sesion_iniciada'
 * @param {object} detalles - Información extra en formato de objeto
 */
export function trackearAccion(nombreEvento, detalles = {}) {
  logEvent(analytics, nombreEvento, detalles);
}