export interface LabeledSelection {
  id: string;
  label: string;
}

export interface SelectionChange {
  beforeValue: string;
  afterValue: string;
  beforeLabel: string;
  afterLabel: string;
}

export function describeSelectionChange({
  initial,
  nextValue,
  options,
  emptyLabel,
}: {
  initial: LabeledSelection | null;
  nextValue: string;
  options: LabeledSelection[];
  emptyLabel: string;
}): SelectionChange | null {
  const beforeValue = initial?.id.trim() ?? "";
  const afterValue = nextValue.trim();
  if (beforeValue === afterValue) return null;

  return {
    beforeValue,
    afterValue,
    beforeLabel: initial?.label ?? emptyLabel,
    afterLabel:
      (afterValue ? options.find((option) => option.id === afterValue)?.label : emptyLabel) ??
      "Unknown selection",
  };
}
