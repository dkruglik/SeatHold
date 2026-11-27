import { useRef, useState, type FormEvent, type RefObject } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "../../../shared/lib/api-client";
import { fieldOrder, initialValues, toRequest, validate, type EventFormValues, type FieldErrors, type FieldName } from "../lib/event-form";
import { useCreateEvent } from "./use-admin-queries";

/** The message for a rejected create: the server's own words for 400, which reference vanished for 404. */
export function createFailureMessage(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      return error.detail ?? "The server rejected the event.";
    }
    if (error.status === 404) {
      return error.code === "SHOW_NOT_FOUND" ? "The show no longer exists. Pick another show." : error.code === "VENUE_NOT_FOUND" ? "The venue no longer exists. Pick another venue." : "A show or venue no longer exists.";
    }
  }
  return "Could not create the event. Please try again.";
}

export function useCreateEventForm(formRef: RefObject<HTMLFormElement | null>) {
  const [values, setValues] = useState<EventFormValues>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = useCreateEvent();
  const navigate = useNavigate();
  const inFlight = useRef(false);

  function set(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) {
      return;
    }
    const found = validate(values, new Date());
    setErrors(found);
    const first = fieldOrder.find((field) => found[field] !== undefined);
    if (first !== undefined) {
      const element = formRef.current?.elements.namedItem(first);
      if (element instanceof HTMLElement) {
        element.focus();
      }
      return;
    }
    inFlight.current = true;
    create.mutate(toRequest(values), {
      onSuccess: (created) => void navigate(`/admin/events/${created.eventId}`),
      onSettled: () => {
        inFlight.current = false;
      },
    });
  }

  return { values, errors, set, submit, pending: create.isPending, failure: create.isError ? createFailureMessage(create.error) : undefined };
}
