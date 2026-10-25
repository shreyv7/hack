import type { ReactElement } from 'react';
import { useState, useRef } from 'react';
import { Modal } from '@/app/components/ui/Modal';
import { Button } from '@/app/components/ui/Button';
import { FileUp, HelpCircle, FileText, Sparkles } from 'lucide-react';
import { draftConsentFromUpload, draftConsentFromQuestions, ConsentDraftResult } from '@/lib/api/vajraAi';
import { notify } from '@/app/utils/notify';

interface VajraAIDraftModalProps {
  onClose: () => void;
  onDraftReady: (draft: ConsentDraftResult) => void;
}

type Mode = 'select' | 'upload' | 'questions' | 'loading';

export function VajraAIDraftModal({ onClose, onDraftReady }: VajraAIDraftModalProps): ReactElement {
  const [mode, setMode] = useState<Mode>('select');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Guided Questions Form State
  const [questions, setQuestions] = useState({
    orgName: '',
    industry: '',
    dataTypes: '',
    retentionPeriod: '',
    dpoName: '',
    dpoEmail: '',
    purpose: '',
  });

  const [loadingStep, setLoadingStep] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const validateFile = (selectedFile: File): boolean => {
    const allowedExtensions = ['.pdf', '.docx', '.txt'];
    const filename = selectedFile.name.toLowerCase();
    const isValidExt = allowedExtensions.some((ext) => filename.endsWith(ext));

    if (!isValidExt) {
      notify('Invalid file format. Please upload PDF, DOCX or TXT files.');
      return false;
    }

    if (selectedFile.size > 500 * 1024) {
      notify('File size exceeds the 500 KB limit.');
      return false;
    }

    return true;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selectedFile = e.dataTransfer.files[0];
      if (validateFile(selectedFile)) {
        setFile(selectedFile);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        setFile(selectedFile);
      }
    }
  };

  const runUploadDraft = async () => {
    if (!file) return;
    setMode('loading');
    setLoadingStep('Extracting document text...');
    
    try {
      setTimeout(() => setLoadingStep('Analyzing with Vajra AI RAG...'), 2000);
      setTimeout(() => setLoadingStep('Formulating DPDPA notice draft...'), 5000);

      const result = await draftConsentFromUpload(file);
      onDraftReady(result);
    } catch (err: any) {
      setMode('upload');
      notify(err.message || 'Failed to draft notice from file.');
    }
  };

  const handleQuestionChange = (field: string, value: string) => {
    setQuestions((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
  };

  const handleQuestionsSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!questions.orgName.trim()) newErrors.orgName = 'Organisation Name is required';
    if (!questions.industry.trim()) newErrors.industry = 'Industry / Sector is required';
    if (!questions.dataTypes.trim()) newErrors.dataTypes = 'Data categories are required';
    if (!questions.dpoEmail.trim()) {
      newErrors.dpoEmail = 'DPO / Grievance Officer Email is compulsory';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(questions.dpoEmail.trim())) {
      newErrors.dpoEmail = 'Invalid email address';
    }
    if (!questions.retentionPeriod.trim()) newErrors.retentionPeriod = 'Data retention period is required';
    if (!questions.purpose.trim()) newErrors.purpose = 'Primary purpose is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      notify('Please fill out all compulsory fields correctly.');
      return;
    }

    setMode('loading');
    setLoadingStep('Synthesizing details...');

    try {
      setTimeout(() => setLoadingStep('Generating notice opening & retention clauses...'), 2000);
      setTimeout(() => setLoadingStep('Building compliance mappings...'), 4500);

      const result = await draftConsentFromQuestions({
        org_name: questions.orgName,
        industry: questions.industry,
        data_types: questions.dataTypes,
        dpo_name: questions.dpoName || '[Not Specified]',
        dpo_email: questions.dpoEmail,
        retention_period: questions.retentionPeriod,
        purpose: questions.purpose,
      });

      onDraftReady(result);
    } catch (err: any) {
      setMode('questions');
      notify(err.message || 'Failed to generate notice draft.');
    }
  };

  return (
    <Modal
      size={mode === 'questions' ? 'lg' : 'md'}
      title="Draft with Vajra AI"
      onClose={onClose}
    >
      <div className="space-y-6">
        {mode === 'select' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Choose how you want Vajra AI to construct your DPDPA-compliant consent notice draft. You can always edit all fields afterwards.
            </p>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <button
                type="button"
                onClick={() => setMode('upload')}
                className="flex flex-col items-center justify-center p-6 rounded-xl border border-[var(--border-default)] hover:border-[var(--brand-primary)] hover:bg-[var(--surface-raised)] transition-all group text-center"
              >
                <div className="p-3 rounded-full bg-violet-500/10 text-violet-500 mb-4 group-hover:scale-110 transition-transform">
                  <FileUp className="size-6" />
                </div>
                <h4 className="font-semibold text-sm mb-1 text-[var(--text-primary)]">Upload Document</h4>
                <p className="text-xs text-[var(--text-secondary)]">
                  PDF, DOCX, or TXT consent files. Ephemeral RAG processed.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('questions')}
                className="flex flex-col items-center justify-center p-6 rounded-xl border border-[var(--border-default)] hover:border-[var(--brand-primary)] hover:bg-[var(--surface-raised)] transition-all group text-center"
              >
                <div className="p-3 rounded-full bg-indigo-500/10 text-indigo-500 mb-4 group-hover:scale-110 transition-transform">
                  <HelpCircle className="size-6" />
                </div>
                <h4 className="font-semibold text-sm mb-1 text-[var(--text-primary)]">Guided Questions</h4>
                <p className="text-xs text-[var(--text-secondary)]">
                  Answer 7 basic questions about your processing activity.
                </p>
              </button>
            </div>
          </div>
        )}

        {mode === 'upload' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--text-secondary)]">
                Upload your existing privacy policy, consent notice or documentation.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setMode('select')}>
                ← Back
              </Button>
            </div>

            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5'
                  : file
                  ? 'border-emerald-500 bg-emerald-500/5'
                  : 'border-[var(--border-default)] hover:bg-[var(--surface-raised)]'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf,.docx,.txt"
                className="hidden"
              />

              {file ? (
                <>
                  <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-500 mb-3 animate-bounce">
                    <FileText className="size-6" />
                  </div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{file.name}</p>
                  <p className="text-xs text-emerald-600 font-semibold mt-1">
                    {(file.size / 1024).toFixed(1)} KB — Ready to draft
                  </p>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] mb-3">
                    <FileUp className="size-6" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Drag & drop your file here</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    or click to browse from files
                  </p>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-4 uppercase font-mono">
                    PDF, DOCX, TXT | max size 500 KB
                  </p>
                </>
              )}
            </div>

            {file && (
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" size="md" onClick={() => setFile(null)}>
                  Clear File
                </Button>
                <Button variant="primary" size="md" onClick={runUploadDraft}>
                  ⚡ Draft with Vajra AI
                </Button>
              </div>
            )}
          </div>
        )}

        {mode === 'questions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2 border-[var(--border-default)]">
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                Please provide details below. Compulsory fields are marked with *.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setMode('select')}>
                ← Back
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 max-h-[450px] overflow-y-auto pr-1">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)]">
                  Organisation Name *
                </label>
                <input
                  type="text"
                  value={questions.orgName}
                  onChange={(e) => handleQuestionChange('orgName', e.target.value)}
                  placeholder="e.g., Acme Technologies Pvt Ltd"
                  className={`w-full text-sm bg-[var(--surface-raised)] border rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--brand-primary)] ${
                    errors.orgName ? 'border-rose-500' : 'border-[var(--border-default)]'
                  }`}
                />
                {errors.orgName && <p className="text-[10px] text-rose-500">{errors.orgName}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)]">
                  Industry / Sector *
                </label>
                <input
                  type="text"
                  value={questions.industry}
                  onChange={(e) => handleQuestionChange('industry', e.target.value)}
                  placeholder="e.g., E-Commerce, HealthTech"
                  className={`w-full text-sm bg-[var(--surface-raised)] border rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--brand-primary)] ${
                    errors.industry ? 'border-rose-500' : 'border-[var(--border-default)]'
                  }`}
                />
                {errors.industry && <p className="text-[10px] text-rose-500">{errors.industry}</p>}
              </div>

              <div className="col-span-2 space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)]">
                  Types of Personal Data Collected *
                </label>
                <textarea
                  value={questions.dataTypes}
                  onChange={(e) => handleQuestionChange('dataTypes', e.target.value)}
                  placeholder="e.g., Customer names, email, billing address, credit card numbers"
                  rows={2}
                  className={`w-full text-sm bg-[var(--surface-raised)] border rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--brand-primary)] resize-none ${
                    errors.dataTypes ? 'border-rose-500' : 'border-[var(--border-default)]'
                  }`}
                />
                {errors.dataTypes && <p className="text-[10px] text-rose-500">{errors.dataTypes}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)]">
                  DPO / Grievance Officer Name (optional)
                </label>
                <input
                  type="text"
                  value={questions.dpoName}
                  onChange={(e) => handleQuestionChange('dpoName', e.target.value)}
                  placeholder="e.g., Nikit Potdar"
                  className="w-full text-sm bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--brand-primary)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)]">
                  DPO / Grievance Officer Email *
                </label>
                <input
                  type="email"
                  value={questions.dpoEmail}
                  onChange={(e) => handleQuestionChange('dpoEmail', e.target.value)}
                  placeholder="e.g., dpo@acme.com"
                  className={`w-full text-sm bg-[var(--surface-raised)] border rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--brand-primary)] ${
                    errors.dpoEmail ? 'border-rose-500' : 'border-[var(--border-default)]'
                  }`}
                />
                {errors.dpoEmail && <p className="text-[10px] text-rose-500">{errors.dpoEmail}</p>}
              </div>

              <div className="space-y-1 col-span-2">
                <label className="text-xs font-semibold text-[var(--text-primary)]">
                  Data Retention Time Period *
                </label>
                <input
                  type="text"
                  value={questions.retentionPeriod}
                  onChange={(e) => handleQuestionChange('retentionPeriod', e.target.value)}
                  placeholder="e.g., 3 years, or until account deletion request"
                  className={`w-full text-sm bg-[var(--surface-raised)] border rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--brand-primary)] ${
                    errors.retentionPeriod ? 'border-rose-500' : 'border-[var(--border-default)]'
                  }`}
                />
                {errors.retentionPeriod && <p className="text-[10px] text-rose-500">{errors.retentionPeriod}</p>}
              </div>

              <div className="col-span-2 space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)]">
                  Primary Purpose of Data Collection *
                </label>
                <textarea
                  value={questions.purpose}
                  onChange={(e) => handleQuestionChange('purpose', e.target.value)}
                  placeholder="e.g., To validate customer identity, complete financial transactions, and deliver ordered products."
                  rows={2}
                  className={`w-full text-sm bg-[var(--surface-raised)] border rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--brand-primary)] resize-none ${
                    errors.purpose ? 'border-rose-500' : 'border-[var(--border-default)]'
                  }`}
                />
                {errors.purpose && <p className="text-[10px] text-rose-500">{errors.purpose}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--border-default)]">
              <Button variant="secondary" size="md" onClick={() => setMode('select')}>
                Cancel
              </Button>
              <Button variant="primary" size="md" onClick={handleQuestionsSubmit}>
                ⚡ Draft with Vajra AI
              </Button>
            </div>
          </div>
        )}

        {mode === 'loading' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-full border-4 border-[var(--border-default)] border-t-[var(--brand-primary)] animate-spin size-16"></div>
              <div className="flex items-center justify-center size-16">
                <Sparkles className="size-6 text-[var(--brand-primary)] animate-pulse" />
              </div>
            </div>
            <div className="text-center">
              <h4 className="font-semibold text-[var(--text-primary)]">Processing with Vajra AI</h4>
              <p className="text-xs text-[var(--text-secondary)] mt-1 animate-pulse font-mono tracking-wider uppercase">
                {loadingStep}
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
