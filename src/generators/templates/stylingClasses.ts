export interface StylingClasses {
  // Layout
  pageContainer: string;
  card: string;
  cardBody: string;

  // Spacing helpers used inline in templates
  mb3: string;
  mt3: string;
  mt4: string;

  // Buttons
  btnPrimary: string;
  btnSecondary: string;
  btnWarning: string;
  btnSmInfo: string;
  btnSmWarning: string;
  btnSmOutlineSecondary: string;
  btnSmPrimary: string;

  // Table
  table: string;

  // Forms
  formControl: string;
  formSelect: string;
  formSelectSm: string;
  formControlSm: string;
  formLabel: string;
  formCheck: string;
  formCheckInput: string;
  formCheckLabel: string;
  formCheckInline: string;
  formSubmitRow: string;

  // Grid / layout helpers used in field rendering
  rowMb2: string;
  col4: string;
  col8: string;
  colAuto: string;
  col: string;
  rowG2: string;
  rowG2AlignEnd: string;

  // Grouped / compound field containers
  borderGroup: string;
  textMuted: string;

  // Pagination
  pagination: string;

  // Detail page field row
  detailFieldRow: string;
  detailFieldLabel: string;
  detailFieldValue: string;
}

export const bootstrapClasses: StylingClasses = {
  pageContainer: 'container mt-4',
  card: 'card',
  cardBody: 'card-body',

  mb3: 'mb-3',
  mt3: 'mt-3',
  mt4: 'mt-4',

  btnPrimary: 'btn btn-primary',
  btnSecondary: 'btn btn-secondary',
  btnWarning: 'btn btn-warning',
  btnSmInfo: 'btn btn-sm btn-info',
  btnSmWarning: 'btn btn-sm btn-warning',
  btnSmOutlineSecondary: 'btn btn-sm btn-outline-secondary',
  btnSmPrimary: 'btn btn-primary btn-sm',

  table: 'table table-striped',

  formControl: 'form-control',
  formSelect: 'form-select',
  formSelectSm: 'form-select form-select-sm',
  formControlSm: 'form-control form-control-sm',
  formLabel: 'form-label',
  formCheck: 'form-check',
  formCheckInput: 'form-check-input',
  formCheckLabel: 'form-check-label',
  formCheckInline: 'form-check form-check-inline',
  formSubmitRow: 'd-flex gap-2',

  rowMb2: 'row mb-2',
  col4: 'col-4',
  col8: 'col-8',
  colAuto: 'col-auto',
  col: 'col',
  rowG2: 'row g-2',
  rowG2AlignEnd: 'row g-2 align-items-end',

  borderGroup: 'border rounded p-2',
  textMuted: 'text-muted',

  pagination: 'pagination',

  detailFieldRow: 'row mb-2',
  detailFieldLabel: 'col-4',
  detailFieldValue: 'col-8',
};

export const tailwindClasses: StylingClasses = {
  pageContainer: 'max-w-7xl mx-auto px-4 mt-8',
  card: 'border border-gray-200 rounded-lg shadow-sm',
  cardBody: 'p-6',

  mb3: 'mb-4',
  mt3: 'mt-4',
  mt4: 'mt-6',

  btnPrimary: 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-block',
  btnSecondary: 'px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 inline-block',
  btnWarning: 'px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 inline-block',
  btnSmInfo: 'px-2 py-1 text-sm bg-cyan-500 text-white rounded hover:bg-cyan-600 inline-block',
  btnSmWarning: 'px-2 py-1 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600 inline-block',
  btnSmOutlineSecondary: 'px-2 py-1 text-sm border border-gray-400 text-gray-600 rounded hover:bg-gray-100 inline-block',
  btnSmPrimary: 'px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 inline-block',

  table: 'w-full border-collapse',

  formControl: 'w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500',
  formSelect: 'w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white',
  formSelectSm: 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white',
  formControlSm: 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
  formLabel: 'block text-sm font-medium text-gray-700 mb-1',
  formCheck: 'flex items-center gap-2',
  formCheckInput: 'h-4 w-4 text-blue-600 border-gray-300 rounded',
  formCheckLabel: 'text-sm text-gray-700',
  formCheckInline: 'inline-flex items-center gap-1 mr-4',
  formSubmitRow: 'flex gap-2',

  rowMb2: 'grid grid-cols-12 gap-2 mb-2',
  col4: 'col-span-4',
  col8: 'col-span-8',
  colAuto: 'w-auto',
  col: 'flex-1',
  rowG2: 'flex flex-wrap gap-2',
  rowG2AlignEnd: 'flex flex-wrap gap-2 items-end',

  borderGroup: 'border border-gray-200 rounded p-2',
  textMuted: 'text-gray-500 text-sm',

  pagination: 'flex gap-1 list-none',

  detailFieldRow: 'grid grid-cols-12 gap-2 mb-2',
  detailFieldLabel: 'col-span-4',
  detailFieldValue: 'col-span-8',
};

export function getClasses(styling: string): StylingClasses {
  if (styling === 'tailwind') {
    return tailwindClasses;
  }
  return bootstrapClasses;
}
