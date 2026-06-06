import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDF1PV9MIAEO9XKmXPgR8Q4qJsnt9vqML4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "client-log-1c2f5.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "client-log-1c2f5",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "client-log-1c2f5.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "177351407362",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:177351407362:web:2c9dacd4cbe0aba75df41b",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-Q3C512WCCW"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
