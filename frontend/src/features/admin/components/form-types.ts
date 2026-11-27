import type { EventFormValues, FieldErrors, FieldName } from "../lib/event-form";

export interface FormApi {
  readonly values: EventFormValues;
  readonly errors: FieldErrors;
  readonly venueConflict?: boolean;
  readonly set: (field: FieldName, value: string) => void;
}

/** The props every input shares: its name (used to focus the first invalid field), value, change handler and error. */
export function bind(form: FormApi, field: FieldName) {
  return {
    name: field,
    value: form.values[field],
    error: form.errors[field],
    onChange: (event: { readonly currentTarget: { readonly value: string } }) => form.set(field, event.currentTarget.value),
  };
}
