// ============================================================
// FIREBASE CONFIGURATION
// Replace the values below with your own Firebase project config.
// See SETUP-GUIDE.md for step-by-step instructions.
// ============================================================

var firebaseConfig = {
  apiKey: "AIzaSyARcqMizuiRHHfu08BNFfLz0rav1JVk2Do",
  authDomain: "akhilesh-malani-website.firebaseapp.com",
  databaseURL: "https://akhilesh-malani-website-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "akhilesh-malani-website",
  storageBucket: "akhilesh-malani-website.firebasestorage.app",
  messagingSenderId: "452853877949",
  appId: "1:452853877949:web:a6e524b45c53c2ac5f3bd4"
};

// Initialize Firebase (gracefully handle placeholder config)
var auth = null;
var db = null;
try {
  if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== 'YOUR_API_KEY') {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
  }
} catch (e) {
  console.warn('Firebase initialization skipped:', e.message);
}
