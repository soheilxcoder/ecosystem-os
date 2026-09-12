/**
 * Payload types shared between the API and the agreement screens.
 *
 * Kept next to the API's response shape on purpose: the app is a pure
 * server-side client of the API, so a change to the payload breaks the
 * typecheck here rather than at runtime.
 */

import type { StatusTone } from '../components/ui/StatusChip';
import type {
  CloudAgreementStatus,
  CloudCadence,
  CloudDirection,
  CloudFrequency,
  CloudPricingTerms,
} from '../core/types';
import type { CloudDisplayStatus } from '../core/agreements';

export interface AgreementView {
  id: string;
  name: string;
  serviceDescription: string;
  direction: CloudDirection;
  cadence: CloudCadence;
  frequency: CloudFrequency | null;
  pricingTerms: CloudPricingTerms;
  status: CloudAgreementStatus;
  displayStatus: CloudDisplayStatus;
  awaitingPodId: string | null;
  podAId: string;
  podBId: string;
  podAName: string;
  podBName: string;
  podAHoldingId: string;
  podBHoldingId: string;
  podAHoldingName: string;
  podBHoldingName: string;
  startDate: string | null;
  renewalDate: string | null;
  updatedAt: string;
}

export interface AgreementEventView {
  id: string;
  eventType: string;
  actorUserId: string | null;
  actorName: string | null;
  note: string | null;
  terms: Partial<{
    name: string;
    serviceDescription: string;
    direction: CloudDirection;
    cadence: CloudCadence;
    frequency: CloudFrequency | null;
  }> | null;
  createdAt: string;
}

export interface EscalationContactView {
  podId: string;
  podName: string;
  role: string;
  userId: string;
  fullName: string;
  email: string;
  startDate: string;
  endDate: string | null;
}

export interface AgreementDetailPayload {
  agreement: AgreementView;
  events: AgreementEventView[];
  escalation: EscalationContactView[];
  archiveConfirmations: Array<{
    podId: string;
    podName: string;
    confirmedByUserId: string | null;
    confirmedByName: string | null;
    createdAt: string;
  }>;
  viewerPodIds: string[];
}

export interface GraphPayload {
  hub: { id: string; name: string; subtitle: string; x: number; y: number; radius: number };
  nodes: Array<{
    id: string;
    name: string;
    holdingId: string;
    holdingName: string;
    status: string;
    agreementCount: number;
    x: number;
    y: number;
  }>;
  edges: Array<{
    id: string;
    agreementId: string;
    name: string;
    serviceLabel: string;
    direction: CloudDirection;
    kind: 'active' | 'renegotiating';
    fromPodId: string;
    toPodId: string;
    bidirectional: boolean;
    path: string;
    labelX: number;
    labelY: number;
  }>;
  hubEdges: Array<{ podId: string; path: string }>;
  width: number;
  height: number;
  nodeRadius: number;
  focusPodId?: string;
  viewerPodIds: string[];
  activeCount: number;
  unconnectedPodIds: string[];
}

export const AGREEMENT_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'renegotiating', label: 'Under renegotiation' },
  { value: 'expired', label: 'Expired' },
  { value: 'proposed', label: 'Awaiting response' },
  { value: 'countered', label: 'Counter-proposed' },
  { value: 'declined', label: 'Declined' },
  { value: 'archived', label: 'Archived' },
];

/** Maps a display status onto the five-tone chip vocabulary (§4). */
export function agreementStatusTone(displayStatus: string): StatusTone {
  switch (displayStatus) {
    case 'active':
      return 'good';
    case 'renegotiating':
    case 'countered':
      return 'watch';
    case 'expired':
      return 'alert';
    case 'proposed':
      return 'active';
    case 'declined':
    case 'archived':
    default:
      return 'neutral';
  }
}
