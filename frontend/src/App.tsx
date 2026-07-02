import React, { useMemo, useState } from 'react';
import './App.css';
import {
  ApplicationInput,
  FieldResult,
  VerifyResponseItem,
  verifyBatch,
} from './api';

interface Row extends ApplicationInput {
  id: number;
  file: File | null;
  previewUrl: string | null;
}

let nextId = 1;

function emptyRow(): Row {
  return {
    id: nextId++,
    brandName: '',
    classType: '',
    alcoholContent: '',
    netContents: '',
    file: null,
    previewUrl: null,
  };
}

const STATUS_LABEL: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fail',
  warning: 'Review',
  skipped: 'Not checked',
};

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status] || status}</span>;
}

function OverallBanner({ overall }: { overall: string }) {
  const text =
    overall === 'pass'
      ? 'PASS — all checked fields match'
      : overall === 'warning'
      ? 'NEEDS REVIEW — one or more fields need a human look'
      : 'FAIL — one or more fields do not comply';
  return <div className={`overall overall-${overall}`}>{text}</div>;
}

function FieldTable({ fields }: { fields: FieldResult[] }) {
  return (
    <table className="fields">
      <thead>
        <tr>
          <th>Field</th>
          <th>Expected (application)</th>
          <th>Found (label)</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((f) => (
          <tr key={f.field} className={`row-${f.status}`}>
            <td data-label="Field">{f.label}</td>
            <td data-label="Expected">{f.expected || <em>—</em>}</td>
            <td data-label="Found">{f.found || <em>—</em>}</td>
            <td data-label="Result">
              <StatusBadge status={f.status} />
              {f.note && <div className="note">{f.note}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function App() {
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [results, setResults] = useState<VerifyResponseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (results.length === 0) return null;
    let pass = 0;
    let warn = 0;
    let fail = 0;
    for (const r of results) {
      if (!r.success || !r.result) fail++;
      else if (r.result.overall === 'pass') pass++;
      else if (r.result.overall === 'warning') warn++;
      else fail++;
    }
    return { pass, warn, fail, total: results.length };
  }, [results]);

  function updateField(id: number, name: keyof ApplicationInput, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [name]: value } : r)));
  }

  function updateFile(id: number, file: File | null) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (r.previewUrl) URL.revokeObjectURL(r.previewUrl);
        return { ...r, file, previewUrl: file ? URL.createObjectURL(file) : null };
      })
    );
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(id: number) {
    setRows((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : [emptyRow()];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const missing = rows.some((r) => !r.file);
    if (missing) {
      setError('Please attach a label image for every application before verifying.');
      return;
    }

    setLoading(true);
    setResults([]);
    try {
      const applications: ApplicationInput[] = rows.map((r) => ({
        brandName: r.brandName,
        classType: r.classType,
        alcoholContent: r.alcoholContent,
        netContents: r.netContents,
      }));
      const files = rows.map((r) => r.file as File);
      const items = await verifyBatch(applications, files);
      setResults(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Alcohol Label Verification</h1>
        <p className="subtitle">
          Enter what the application says, attach the label photo, and click Verify.
        </p>
      </header>

      <main>
        <form onSubmit={handleSubmit}>
          {rows.map((row, index) => (
            <section key={row.id} className="card application">
              <div className="application-head">
                <h2>Application {index + 1}</h2>
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-link"
                    onClick={() => removeRow(row.id)}
                    aria-label={`Remove application ${index + 1}`}
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid">
                <label className="field">
                  <span>Brand Name</span>
                  <input
                    type="text"
                    value={row.brandName}
                    placeholder="e.g. OLD TOM DISTILLERY"
                    onChange={(e) => updateField(row.id, 'brandName', e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Class / Type</span>
                  <input
                    type="text"
                    value={row.classType}
                    placeholder="e.g. Kentucky Straight Bourbon Whiskey"
                    onChange={(e) => updateField(row.id, 'classType', e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Alcohol Content</span>
                  <input
                    type="text"
                    value={row.alcoholContent}
                    placeholder="e.g. 45% Alc./Vol. (90 Proof)"
                    onChange={(e) => updateField(row.id, 'alcoholContent', e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Net Contents</span>
                  <input
                    type="text"
                    value={row.netContents}
                    placeholder="e.g. 750 mL"
                    onChange={(e) => updateField(row.id, 'netContents', e.target.value)}
                  />
                </label>
              </div>

              <div className="upload-row">
                <label className="field file-field">
                  <span>Label Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => updateFile(row.id, e.target.files?.[0] ?? null)}
                  />
                </label>
                {row.previewUrl && (
                  <img className="preview" src={row.previewUrl} alt="Label preview" />
                )}
              </div>
            </section>
          ))}

          <div className="actions">
            <button type="button" className="btn btn-secondary" onClick={addRow}>
              + Add another application
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Verifying…' : `Verify ${rows.length > 1 ? `all ${rows.length}` : ''}`}
            </button>
          </div>
        </form>

        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}

        {loading && (
          <div className="loading" role="status">
            <div className="spinner" aria-hidden="true" />
            <span>Reading labels…</span>
          </div>
        )}

        {summary && (
          <div className="results">
            <div className="summary">
              <h2>Results</h2>
              <div className="summary-counts">
                <span className="pill pill-pass">{summary.pass} passed</span>
                <span className="pill pill-warning">{summary.warn} to review</span>
                <span className="pill pill-fail">{summary.fail} failed</span>
              </div>
            </div>

            {results.map((item) => (
              <section key={item.index} className="card result">
                <div className="result-head">
                  <h3>
                    Application {item.index + 1}
                    <span className="filename"> — {item.fileName}</span>
                  </h3>
                  {typeof item.durationMs === 'number' && (
                    <span className="timing">{(item.durationMs / 1000).toFixed(1)}s</span>
                  )}
                </div>

                {item.success && item.result ? (
                  <>
                    <OverallBanner overall={item.result.overall} />
                    <FieldTable fields={item.result.fields} />
                    <details className="raw">
                      <summary>Show text read from label</summary>
                      <pre>{item.result.extractedText}</pre>
                    </details>
                  </>
                ) : (
                  <div className="alert" role="alert">
                    Could not process this label: {item.message || 'unknown error'}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </main>

      <footer className="app-footer">
        <small>
          Prototype — proof of concept. Results are advisory; a compliance agent makes the final
          determination.
        </small>
      </footer>
    </div>
  );
}

export default App;
