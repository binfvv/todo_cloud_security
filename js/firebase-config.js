import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  push,
  onValue,
  remove,
  update,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCePxZbi912s3nzvmUIKyi0u8Wy94MtAgY",
  authDomain: "todo-app-security.firebaseapp.com",
  databaseURL:
    "https://todo-app-security-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "todo-app-security",
  storageBucket: "todo-app-security.firebasestorage.app",
  messagingSenderId: "139564313152",
  appId: "1:139564313152:web:f77818571ff5bdd5d84da5",
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);

// Export các công cụ để dùng ở file khác
export const auth = getAuth(app);
export const db = getDatabase(app);
export const provider = new GoogleAuthProvider();
export {
  
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  ref,
  set,
  push,
  onValue,
  remove,
  update,
};
