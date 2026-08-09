import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  Shield,
  Lock,
  Info,
  ArrowRight,
  ScanLine,
  Brain,
  FileCheck,
  Database,
} from 'lucide-react';
import { UploadZone } from '../components/UploadZone';
import { Scan } from '../types';

const STEPS = [
  { id: 1, label: 'Upload Scan', icon: ScanLine },
  { id: 2, label: 'Validate & Anonymize', icon: FileCheck },
  { id: 3, label: 'AI Analysis', icon: Brain },
  { id: 4, label: 'Review Results', icon: CheckCircle },
  { id: 5, label: 'Save to History', icon: Database },
];

export function UploadPage() {
  const navigate = useNavigate();
  const [lastScan, setLastScan] = useState<Scan | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [successMessage, setSuccessMessage] = useState('');

  const handleUploaded = (scan: Scan) => {
    setLastScan(scan);
    setCurrentStep(2);
    setSuccessMessage(
      `"${scan.original_filename}" uploaded and validated successfully.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">Upload Medical Scan</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Chest X-ray or CT scan (JPEG, PNG, DICOM) — PHI is stripped automatically before processing.
        </p>
      </div>

      {/* Workflow stepper */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between relative">
          {/* Progress line */}
          <div className="absolute top-5 left-0 right-0 h-px bg-slate-100 -z-0" />
          <div
            className="absolute top-5 left-0 h-px bg-blue-500 transition-all duration-700 -z-0"
            style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
          />

          {STEPS.map((step) => {
            const Icon = step.icon;
            const isCompleted = currentStep > step.id;
            const isActive = currentStep === step.id;

            return (
              <div key={step.id} className="flex flex-col items-center gap-2 z-10">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                    isCompleted
                      ? 'bg-blue-600 border-blue-600'
                      : isActive
                      ? 'bg-white border-blue-600'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5 text-white" />
                  ) : (
                    <Icon
                      className={`w-5 h-5 ${
                        isActive ? 'text-blue-600' : 'text-slate-300'
                      }`}
                    />
                  )}
                </div>
                <p
                  className={`text-xs font-medium hidden sm:block text-center max-w-[80px] leading-tight ${
                    isActive
                      ? 'text-blue-700'
                      : isCompleted
                      ? 'text-slate-600'
                      : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main upload area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Success banner + CTA */}
          {lastScan && successMessage && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800">
                  {successMessage}
                </p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  PHI stripped and file encrypted at rest. Ready for AI analysis.
                </p>
              </div>
              <button
                onClick={() => navigate(`/results/${lastScan.id}`)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-all flex-shrink-0"
              >
                Analyze
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Upload zone card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <UploadZone
              onUploaded={handleUploaded}
              onError={(msg) => console.error('[UploadZone]', msg)}
            />
          </div>
        </div>

        {/* Sidebar info */}
        <div className="space-y-4">
          {/* Accepted formats */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-400" />
              Accepted Formats
            </h3>
            <div className="space-y-2">
              {[
                { fmt: 'JPEG / PNG', desc: 'Standard image files' },
                { fmt: 'DICOM (.dcm)', desc: 'Medical imaging standard' },
              ].map((item) => (
                <div
                  key={item.fmt}
                  className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
                >
                  <code className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                    {item.fmt}
                  </code>
                  <span className="text-xs text-slate-400">{item.desc}</span>
                </div>
              ))}
              <p className="text-xs text-slate-400 pt-1">Maximum 50 MB per file</p>
            </div>
          </div>

          {/* Guidelines */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              Image Guidelines
            </h3>
            <ul className="space-y-2">
              {[
                'Chest X-rays — PA/AP views preferred',
                'CT scans — lung window settings',
                'DICOM files with intact pixel data',
                'Correct orientation (no rotation)',
              ].map((tip) => (
                <li key={tip} className="flex items-start gap-2 text-xs text-slate-600">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          {/* Privacy */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-500" />
              Privacy & Security
            </h3>
            <ul className="space-y-2">
              {[
                {
                  icon: Shield,
                  text: 'PHI stripped from DICOM metadata before any processing',
                },
                {
                  icon: Lock,
                  text: 'Files encrypted at rest (AES-256) after upload',
                },
                {
                  icon: Info,
                  text: 'Diagnostic results are decision-support only',
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.text} className="flex items-start gap-2">
                    <Icon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-slate-600">{item.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
