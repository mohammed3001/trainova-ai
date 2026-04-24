'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  APPLICATION_FORM_SCHEMA_VERSION,
  FIELD_KINDS,
  type ApplicationForm,
  type FieldKind,
  type FormField,
} from '@trainova/shared';

interface FormBuilderProps {
  value: ApplicationForm;
  onChange: (next: ApplicationForm) => void;
}

let genCounter = 0;
function genId() {
  genCounter += 1;
  return `f${Date.now().toString(36)}${genCounter}`;
}

function blankField(kind: FieldKind, order: number): FormField {
  const base: FormField = {
    id: genId(),
    kind,
    labelEn: '',
    labelAr: '',
    required: false,
    order,
    helpEn: undefined,
    helpAr: undefined,
  };
  if (kind === 'single_select' || kind === 'multi_select') {
    return {
      ...base,
      options: [
        { value: 'option_1', labelEn: 'Option 1', labelAr: 'خيار 1' },
        { value: 'option_2', labelEn: 'Option 2', labelAr: 'خيار 2' },
      ],
    };
  }
  return base;
}

export function FormBuilder({ value, onChange }: FormBuilderProps) {
  const t = useTranslations('requests.formBuilder');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const fieldIds = useMemo(() => value.fields.map((f) => f.id), [value.fields]);

  function mutate(nextFields: FormField[]) {
    const reordered = nextFields.map((f, i) => ({ ...f, order: i }));
    onChange({ version: APPLICATION_FORM_SCHEMA_VERSION, fields: reordered });
  }

  function handleAdd(kind: FieldKind) {
    mutate([...value.fields, blankField(kind, value.fields.length)]);
  }

  function handleRemove(id: string) {
    mutate(value.fields.filter((f) => f.id !== id));
  }

  function handleUpdate(id: string, patch: Partial<FormField>) {
    mutate(value.fields.map((f) => (f.id === id ? ({ ...f, ...patch } as FormField) : f)));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = value.fields.findIndex((f) => f.id === active.id);
    const newIndex = value.fields.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    mutate(arrayMove(value.fields, oldIndex, newIndex));
  }

  return (
    <div className="space-y-3" data-testid="form-builder">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t('title')}</h3>
          <p className="text-xs text-slate-500">{t('description')}</p>
        </div>
      </div>

      {value.fields.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">
          {t('empty')}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {value.fields.map((field, idx) => (
                <SortableFieldRow
                  key={field.id}
                  field={field}
                  index={idx}
                  onRemove={() => handleRemove(field.id)}
                  onUpdate={(patch) => handleUpdate(field.id, patch)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {FIELD_KINDS.map((kind) => (
          <button
            type="button"
            key={kind}
            onClick={() => handleAdd(kind)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-brand-400 hover:text-brand-700"
            data-testid={`form-builder-add-${kind}`}
          >
            + {t(`kinds.${kind}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

interface FieldRowProps {
  field: FormField;
  index: number;
  onRemove: () => void;
  onUpdate: (patch: Partial<FormField>) => void;
}

function SortableFieldRow({ field, index, onRemove, onUpdate }: FieldRowProps) {
  const t = useTranslations('requests.formBuilder');
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const hasOptions = field.kind === 'single_select' || field.kind === 'multi_select';

  function updateOption(optIndex: number, patch: Partial<NonNullable<FormField['options']>[number]>) {
    const next = (field.options ?? []).map((o, i) => (i === optIndex ? { ...o, ...patch } : o));
    onUpdate({ options: next });
  }

  function addOption() {
    // Derive a collision-free value. Using length+1 breaks after a removal
    // (remove option_1 from [option_1, option_2] -> add yields another
    // "option_2" which the server's uniqueness check rejects). Instead, pick
    // the smallest unused "option_N" for the current field.
    const existing = new Set((field.options ?? []).map((o) => o.value));
    let n = (field.options ?? []).length + 1;
    while (existing.has(`option_${n}`)) n += 1;
    const next = [
      ...(field.options ?? []),
      {
        value: `option_${n}`,
        labelEn: '',
        labelAr: '',
      },
    ];
    onUpdate({ options: next });
  }

  function removeOption(optIndex: number) {
    const next = (field.options ?? []).filter((_, i) => i !== optIndex);
    onUpdate({ options: next });
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-md border border-slate-200 bg-white p-3 text-sm shadow-sm"
      data-testid={`form-builder-field-${index}`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t('dragHandle')}
          className="cursor-grab rounded px-2 py-1 text-slate-400 hover:bg-slate-100"
        >
          ⋮⋮
        </button>
        <span className="flex-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          {t(`kinds.${field.kind}`)}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          data-testid={`form-builder-remove-${index}`}
        >
          {t('remove')}
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs">
          <span className="label">{t('labelEn')}</span>
          <input
            className="input"
            value={field.labelEn}
            onChange={(e) => onUpdate({ labelEn: e.target.value })}
          />
        </label>
        <label className="text-xs">
          <span className="label">{t('labelAr')}</span>
          <input
            dir="rtl"
            className="input"
            value={field.labelAr}
            onChange={(e) => onUpdate({ labelAr: e.target.value })}
          />
        </label>
        <label className="text-xs">
          <span className="label">{t('helpEn')}</span>
          <input
            className="input"
            value={field.helpEn ?? ''}
            onChange={(e) => onUpdate({ helpEn: e.target.value || undefined })}
          />
        </label>
        <label className="text-xs">
          <span className="label">{t('helpAr')}</span>
          <input
            dir="rtl"
            className="input"
            value={field.helpAr ?? ''}
            onChange={(e) => onUpdate({ helpAr: e.target.value || undefined })}
          />
        </label>
      </div>

      <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => onUpdate({ required: e.target.checked })}
        />
        {t('required')}
      </label>

      {hasOptions ? (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-2">
          <div className="text-xs font-medium text-slate-600">{t('options')}</div>
          {(field.options ?? []).map((opt, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
              <input
                className="input text-xs"
                placeholder={t('optionValue')}
                value={opt.value}
                onChange={(e) => updateOption(i, { value: e.target.value })}
              />
              <input
                className="input text-xs"
                placeholder={t('labelEn')}
                value={opt.labelEn}
                onChange={(e) => updateOption(i, { labelEn: e.target.value })}
              />
              <input
                className="input text-xs"
                dir="rtl"
                placeholder={t('labelAr')}
                value={opt.labelAr}
                onChange={(e) => updateOption(i, { labelAr: e.target.value })}
              />
              <button
                type="button"
                className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-red-300 hover:text-red-600"
                onClick={() => removeOption(i)}
                aria-label={t('removeOption')}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:border-brand-400 hover:text-brand-700"
          >
            + {t('addOption')}
          </button>
        </div>
      ) : null}
    </li>
  );
}
