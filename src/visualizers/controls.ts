export function createSliderControl(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  suffix: string,
  onInput: (value: number) => void,
): HTMLElement {
  const field = document.createElement("label");
  field.className = "adjustment-field";

  const caption = document.createElement("span");
  caption.className = "adjustment-label";
  caption.textContent = label;

  const valueText = document.createElement("span");
  valueText.className = "adjustment-value";
  valueText.textContent = formatSliderValue(value, suffix);

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => {
    const nextValue = Number(input.value);
    valueText.textContent = formatSliderValue(nextValue, suffix);
    onInput(nextValue);
  });

  field.append(caption, input, valueText);
  return field;
}

export function createSelectControl<T extends string>(
  label: string,
  options: readonly { label: string; value: T }[],
  value: T,
  onChange: (value: T) => void,
): HTMLElement {
  const field = document.createElement("label");
  field.className = "adjustment-field select-field";

  const caption = document.createElement("span");
  caption.className = "adjustment-label";
  caption.textContent = label;

  const select = document.createElement("select");
  select.setAttribute("aria-label", label);

  for (const option of options) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    element.selected = option.value === value;
    select.append(element);
  }

  select.addEventListener("change", () => {
    onChange(select.value as T);
  });

  field.append(caption, select);
  return field;
}

function formatSliderValue(value: number, suffix: string): string {
  return `${Math.round(value)}${suffix}`;
}
