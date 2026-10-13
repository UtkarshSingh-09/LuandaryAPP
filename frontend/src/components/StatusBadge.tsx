import React from "react";
import { RequestStatus, RequestType } from "@/lib/types";

interface StatusBadgeProps {
  status: RequestStatus;
  type?: RequestType;
}

export function StatusBadge({ status, type = "DROP" }: StatusBadgeProps) {
  let label: string = status;
  let pillClass = "status-pill";

  switch (status) {
    case "PAYMENT_PENDING":
      label = "Awaiting Payment";
      pillClass += " status-payment-pending";
      break;
    case "OPEN":
      label = "Finding Partner";
      pillClass += " status-open";
      break;
    case "ACCEPTED":
      label = type === "DROP" ? "Partner on the way" : "Heading to laundry";
      pillClass += " status-accepted";
      break;
    case "PICKED_UP":
      label = type === "DROP" ? "Bag heading to laundry" : "Bag on the way to you";
      pillClass += " status-picked-up";
      break;
    case "COMPLETED":
      label = type === "DROP" ? "Handed into laundry" : "Delivered";
      pillClass += " status-completed";
      break;
    case "CANCELLED":
      label = "Cancelled";
      pillClass += " status-cancelled";
      break;
    case "EXPIRED":
      label = "No partner found (Refunded)";
      pillClass += " status-cancelled";
      break;
    case "DISPUTED":
      label = "Under Review";
      pillClass += " status-disputed";
      break;
  }

  const isLive = ["OPEN", "ACCEPTED", "PICKED_UP"].includes(status);

  return (
    <span className={pillClass}>
      {isLive && <span className="radar-dot" />}
      {label}
    </span>
  );
}

export default StatusBadge;

