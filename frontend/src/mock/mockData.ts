import { HealthResponse, Prediction, Scan, User } from '../types';

// Deterministic demo dataset used only when the FastAPI backend is
// unreachable (e.g. static preview). All real requests still go through
// services/api.ts to the actual /api/v1 endpoints first.

const CLASSES = ['Normal', 'Pneumonia', 'Pleural Effusion', 'Cardiomegaly', 'Nodule'];
const MODALITIES = ['X-Ray', 'CT'];
const BODY_PARTS = ['Chest', 'Chest', 'Lung'];

export const DEMO_USERS: Record<string, { user: User; password: string }> = {
  doctor: {
    password: 'DemoPass123!',
    user: {
      id: 1,
      username: 'doctor',
      email: 'doctor@mediscan.ai',
      full_name: 'Dr. Ananya Rao',
      role: 'doctor',
      is_active: true,
      created_at: '2024-01-10T09:00:00Z',
      last_login: new Date().toISOString(),
    },
  },
  radiologist: {
    password: 'DemoPass123!',
    user: {
      id: 2,
      username: 'radiologist',
      email: 'radiologist@mediscan.ai',
      full_name: 'Dr. Marcus Chen',
      role: 'radiologist',
      is_active: true,
      created_at: '2024-01-10T09:00:00Z',
      last_login: new Date().toISOString(),
    },
  },
  staff: {
    password: 'DemoPass123!',
    user: {
      id: 3,
      username: 'staff',
      email: 'staff@mediscan.ai',
      full_name: 'Priya Nair',
      role: 'staff',
      is_active: true,
      created_at: '2024-01-10T09:00:00Z',
      last_login: new Date().toISOString(),
    },
  },
};

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function buildProbabilities(rnd: () => number, primary: string, confidence: number) {
  const rest = CLASSES.filter((c) => c !== primary);
  const remaining = 1 - confidence;
  const weights = rest.map(() => rnd());
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const probs: Record<string, number> = { [primary]: confidence };
  rest.forEach((c, i) => {
    probs[c] = Number(((weights[i] / sum) * remaining).toFixed(4));
  });
  return probs;
}

const PATIENT_IDS = [
  'PAT-2026-0001',
  'PAT-2026-0002',
  'PAT-2026-0003',
  'PAT-2026-0004',
  'PAT-2026-0005',
  'PAT-2026-0006',
];

export function generateMockScans(count = 24): Scan[] {
  const rnd = seededRandom(42);
  const scans: Scan[] = [];
  for (let i = 1; i <= count; i++) {
    const daysAgo = Math.floor(rnd() * 30);
    const hoursAgo = Math.floor(rnd() * 24);
    const created = new Date();
    created.setDate(created.getDate() - daysAgo);
    created.setHours(created.getHours() - hoursAgo);
    const status: Scan['status'] =
      i % 11 === 0 ? 'processing' : i % 17 === 0 ? 'failed' : i % 9 === 0 ? 'uploaded' : 'completed';
    scans.push({
      id: i,
      file_hash: `hash_${i}`,
      original_filename: `scan_${1000 + i}.${rnd() > 0.7 ? 'dcm' : 'png'}`,
      file_size: Math.floor(400_000 + rnd() * 4_000_000),
      mime_type: rnd() > 0.7 ? 'application/dicom' : 'image/png',
      anonymized_patient_id: PATIENT_IDS[i % PATIENT_IDS.length],
      study_date: created.toISOString(),
      modality: MODALITIES[i % MODALITIES.length],
      body_part: BODY_PARTS[i % BODY_PARTS.length],
      status,
      uploaded_by: (i % 3) + 1,
      created_at: created.toISOString(),
      processed_at: status === 'completed' ? created.toISOString() : null,
      thumbnail_url: null,
    });
  }
  return scans;
}

export function generateMockPredictions(scans: Scan[]): Prediction[] {
  const rnd = seededRandom(7);
  const predictions: Prediction[] = [];
  scans
    .filter((s) => s.status === 'completed')
    .forEach((scan, idx) => {
      const cls = CLASSES[Math.floor(rnd() * CLASSES.length)];
      const isNormal = cls === 'Normal';
      let confidence = 0.55 + rnd() * 0.44;
      if (idx % 6 === 0) confidence = 0.45 + rnd() * 0.2; // force some low-confidence
      confidence = Number(confidence.toFixed(3));
      const is_low_confidence = confidence < 0.7;
      const is_high_risk = !isNormal && confidence > 0.85 && (cls === 'Pneumonia' || cls === 'Cardiomegaly');
      const is_flagged = is_low_confidence ? rnd() > 0.5 : is_high_risk && rnd() > 0.6;
      predictions.push({
        id: idx + 1,
        scan_id: scan.id,
        predicted_class: cls,
        confidence,
        all_probabilities: buildProbabilities(rnd, cls, confidence),
        gradcam_url: `demo://gradcam/${scan.id}`,
        processing_time_ms: Math.floor(180 + rnd() * 900),
        model_version: 'v1.4.2',
        model_architecture: rnd() > 0.3 ? 'resnet50-cnn' : 'baseline-heuristic',
        is_low_confidence,
        is_high_risk,
        is_flagged,
        flagged_by: is_flagged ? 1 : null,
        flagged_at: is_flagged ? scan.created_at : null,
        model_decision_threshold: 0.8,
        scan,
        created_at: scan.created_at,
      });
    });
  return predictions;
}

export const DEMO_HEALTH: HealthResponse = {
  status: 'ok',
  version: '1.3.0',
  model_loaded: true,
  engine: 'resnet50-cnn',
  device: 'cuda:0',
  model_path: '/app/models/model.pth',
  heuristic_fallback_active: false,
  model_decision_threshold: 0.8,
  model_metrics: {
    num_samples: 624,
    accuracy: 0.891,
    balanced_accuracy: 0.886,
    sensitivity: 0.908,
    specificity: 0.863,
    precision: 0.902,
    auc: 0.946,
    class_names: ['Normal', 'Pneumonia'],
  },
};

