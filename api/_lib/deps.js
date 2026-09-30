import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpError } from './http.js';
import { parseAdminEmails } from './auth.js';
import { createRevenueCat } from './revenuecat.js';
import { createStore } from './store.js';

const REQUIRED = [
  'REVENUECAT_IOS_V1_SECRET_KEY', 'REVENUECAT_IOS_V2_SECRET_KEY', 'REVENUECAT_IOS_PROJECT_ID',
  'REVENUECAT_ANDROID_V1_SECRET_KEY', 'REVENUECAT_ANDROID_V2_SECRET_KEY', 'REVENUECAT_ANDROID_PROJECT_ID',
  'FIREBASE_SERVICE_ACCOUNT', 'ADMIN_EMAILS',
];

let cached;
export function getDeps() {
  if (cached) return cached;
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) throw new HttpError(500, `Server not configured: missing ${missing.join(', ')}`);
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  cached = {
    auth: getAuth(),
    store: createStore(getFirestore()),
    rc: {
      ios: createRevenueCat({
        v1Key: process.env.REVENUECAT_IOS_V1_SECRET_KEY,
        v2Key: process.env.REVENUECAT_IOS_V2_SECRET_KEY,
        projectId: process.env.REVENUECAT_IOS_PROJECT_ID,
      }),
      android: createRevenueCat({
        v1Key: process.env.REVENUECAT_ANDROID_V1_SECRET_KEY,
        v2Key: process.env.REVENUECAT_ANDROID_V2_SECRET_KEY,
        projectId: process.env.REVENUECAT_ANDROID_PROJECT_ID,
      }),
    },
    adminEmails: parseAdminEmails(process.env.ADMIN_EMAILS),
  };
  return cached;
}
