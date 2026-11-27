import { Alert, Button, Group, Modal, Stack, Text, Textarea } from "../../../shared/ui";
import { useState } from "react";
import { ApiError } from "../../../shared/lib/api-client";
import { useReleaseSeat } from "../hooks/use-admin-queries";
import type { OpenTicket } from "../types";

const MIN = 3;
const MAX = 500;

function failureText(error: Error): string {
  return error instanceof ApiError && error.status === 409 ? "That seat is no longer held." : error instanceof ApiError && error.status === 404 ? "That seat no longer exists." : "Could not release the seat. Please try again.";
}

const STALE_TEXT = "The hold expired but the seat is still marked held. Clearing it marks the seat available again.";
const LIVE_TEXT = "The buyer's hold on this seat ends and the seat becomes available at once. Their other seats stay held.";

interface Props {
  readonly eventId: string;
  readonly seat: OpenTicket;
  readonly onClose: () => void;
}

/** Confirms a manual release: a reason of 3 to 500 characters is required and goes into the request. */
export function ReleaseModal({ eventId, seat, onClose }: Props) {
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState(false);
  const release = useReleaseSeat(eventId);
  const label = `${seat.row}${seat.number}`;
  const stale = seat.state !== "held";

  function confirm() {
    const trimmed = reason.trim();
    if (trimmed.length < MIN || trimmed.length > MAX || release.isPending) {
      setInvalid(true);
      return;
    }
    release.mutate({ seatId: seat.seatId, reason: trimmed }, { onSuccess: onClose });
  }

  return (
    <Modal opened onClose={onClose} title={stale ? `Clear stale hold on seat ${label}` : `Release seat ${label}`} centered>
      <Stack gap="md">
        <Text size="sm">{stale ? STALE_TEXT : LIVE_TEXT}</Text>
        <Textarea
          label="Reason"
          description={`${reason.trim().length}/${MAX} characters`}
          withAsterisk
          rows={3}
          maxLength={MAX}
          value={reason}
          onChange={(event) => {
            setReason(event.currentTarget.value);
            setInvalid(false);
          }}
          error={invalid ? `Enter a reason of at least ${MIN} characters` : undefined}
          data-autofocus
        />
        {release.isError && (
          <Alert color="red" role="alert">
            {failureText(release.error)}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" loading={release.isPending} onClick={confirm}>
            Release seat
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
