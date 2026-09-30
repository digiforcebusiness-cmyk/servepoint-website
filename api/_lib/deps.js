import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpError } from './http.js';
import { parseAdminEmails } from './auth.js';
import { createRevenueCat } from './revenuecat.js';
import { createStore } from './store.js';

const REQUIRED = ['REVENUECAT_V1_SECRET_KEY', 'REVENUECAT_V2_SECRET_KEY', 'REVENUECAT_PROJECT_ID', 'FIREBASE_SERVICE_ACCOUNT', 'ADMIN_EMAILS'];

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
    rc: createRevenueCat({
      v1Key: process.env.REVENUECAT_V1_SECRET_KEY,
      v2Key: process.env.REVENUECAT_V2_SECRET_KEY,
      projectId: process.env.REVENUECAT_PROJECT_ID,
    }),
    adminEmails: parseAdminEmails(process.env.ADMIN_EMAILS),
  };
  return cached;
}
