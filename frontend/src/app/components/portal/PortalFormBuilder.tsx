import type { ReactElement } from 'react';
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { PortalFormField, PortalFormSchema } from '@/types/dsar';
import { PORTAL_FIELD_TYPE_OPTIONS } from '@/lib/dsar/portalFormUtils';
import { Button } from '@/app/components/ui/Button';

interface PortalFormBuilderProps {
  schema: PortalFormSchema;
  onSave: (schema: PortalFormSchema) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

function newField(): PortalFormField {
  const id = `f_${Date.now()}`;
  return {
    id,
    type: 'text',
    label: 'New field',
    placeholder: '',
    required: false,
    key: id,
    locked: false,
    options: null,
  };
}

export function PortalFormBuilder({
  schema,
  onSave,
  onCancel,
  saving = false,
}: PortalFormBuilderProps): ReactElement {
  const [helpText, setHelpText] = useState(schema.help_text);
  const [fields, setFields] = useState<PortalFormField[]>(schema.fields);

  const updateField = (index: number, patch: Partial<PortalFormField>) => {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f))
    );
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= fields.length) return;
    setFields((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  };

  const removeField = (index: number) => {
    const field = fields[index];
    if (field?.locked) return;
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    await onSave({
      right_type: schema.right_type,
      help_text: helpText,
      fields,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">Help text below form</label>
        <textarea
          rows={3}
          value={helpText}
          onChange={(e) => setHelpText(e.target.value)}
          className="w-full px-3 py-2 border border-[var(--border-default)] rounded-md text-sm"
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Form fields</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFields((prev) => [...prev, newField()])}
          >
            <Plus className="size-4 mr-1" />
            Add field
          </Button>
        </div>

        {fields.map((field, index) => (
          <div
            key={field.id}
            className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-[var(--text-tertiary)]">
                Field {index + 1}
                {field.locked ? ' · required system field' : ''}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveField(index, -1)}
                  disabled={index === 0}
                  className="p-1 rounded hover:bg-[var(--surface-card)] disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveField(index, 1)}
                  disabled={index === fields.length - 1}
                  className="p-1 rounded hover:bg-[var(--surface-card)] disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ArrowDown className="size-4" />
                </button>
                {!field.locked && (
                  <button
                    type="button"
                    onClick={() => removeField(index)}
                    className="p-1 rounded hover:bg-red-50 text-red-600"
                    aria-label="Remove field"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Label</label>
                <input
                  type="text"
                  value={field.label}
                  onChange={(e) => updateField(index, { label: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-[var(--border-default)] rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Input type</label>
                <select
                  value={field.type}
                  disabled={field.locked}
                  onChange={(e) =>
                    updateField(index, {
                      type: e.target.value as PortalFormField['type'],
                      options: e.target.value === 'select' ? field.options ?? ['Option 1'] : null,
                    })
                  }
                  className="w-full px-2 py-1.5 text-sm border border-[var(--border-default)] rounded-md"
                >
                  {PORTAL_FIELD_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Placeholder</label>
                <input
                  type="text"
                  value={field.placeholder}
                  onChange={(e) => updateField(index, { placeholder: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-[var(--border-default)] rounded-md"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={field.required}
                    disabled={field.locked}
                    onChange={(e) => updateField(index, { required: e.target.checked })}
                  />
                  Required
                </label>
              </div>
            </div>

            {field.type === 'select' && (
              <div>
                <label className="block text-xs font-medium mb-1">Options (one per line)</label>
                <textarea
                  rows={3}
                  value={(field.options ?? []).join('\n')}
                  onChange={(e) =>
                    updateField(index, {
                      options: e.target.value
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className="w-full px-2 py-1.5 text-sm border border-[var(--border-default)] rounded-md"
                />
              </div>
            )}

            {!field.locked && (
              <div>
                <label className="block text-xs font-medium mb-1">Field key (stored in request)</label>
                <input
                  type="text"
                  value={field.key}
                  onChange={(e) =>
                    updateField(index, {
                      key: e.target.value.replace(/\s+/g, '_').toLowerCase(),
                      id: field.id,
                    })
                  }
                  className="w-full px-2 py-1.5 text-sm border border-[var(--border-default)] rounded-md font-mono"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="primary" size="md" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Saving…' : 'Save form'}
        </Button>
        <Button variant="secondary" size="md" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
