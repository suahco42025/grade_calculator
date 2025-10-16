const fs = require('fs');
const path = require('path');

// This script runs during the Vercel build process.
// It takes the environment variables and creates a JS file
// that the frontend can use to initialize Firebase.

const firebaseConfig = `
const firebaseConfig = {
    apiKey: "${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}",
    authDomain: "${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}",
    projectId: "${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}",
    storageBucket: "${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}",
    messagingSenderId: "${process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}",
    appId: "${process.env.NEXT_PUBLIC_FIREBASE_APP_ID}"
};
`;

// Write the config to a file that will be included in the deployment.
// The file is placed in the root, so it can be served statically.
fs.writeFileSync(path.join(__dirname, 'firebase-config.js'), firebaseConfig);
console.log('Firebase config file generated successfully.');