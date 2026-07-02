export type FieldStatus = 'pass' | 'fail' | 'warning' | 'skipped';

export interface FieldResult {
  field: string;
  label: string;
  expected: string;
  found: string;
  status: FieldStatus;
  note?: string;
}

export interface VerificationResult {
  overall: 'pass' | 'fail' | 'warning';
  fields: FieldResult[];
  extractedText: string;
}

export interface VerifyResponseItem {
  index: number;
  fileName: string;
  success: boolean;
  message?: string;
  durationMs?: number;
  result?: VerificationResult;
}

export interface ApplicationInput {
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
}

const API_BASE = process.env.REACT_APP_API_BASE || '';

export async function verifyBatch(
  applications: ApplicationInput[],
  files: File[]
): Promise<VerifyResponseItem[]> {
  const form = new FormData();
  files.forEach((f) => form.append('labels', f));
  form.append('applications', JSON.stringify(applications));

  const res = await fetch(`${API_BASE}/api/verify-batch`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status}).`;
    try {
      const data = await res.json();
      if (data?.message) msg = data.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const data = await res.json();
  return data.items as VerifyResponseItem[];
}
