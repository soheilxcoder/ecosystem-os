/** Types shared between the web app and the API payloads. */

import type { PodStatus } from '../core/types';

export interface ApiHolding {
  id: string;
  orgId: string;
  name: string;
  code: string | null;
  createdAt: string;
}

export interface ApiPod {
  id: string;
  holdingId: string;
  name: string;
  categoryTag: string | null;
  status: PodStatus;
  createdAt: string;
  trialEndDate: string | null;
  orgId: string;
  holdingName: string;
  memberCount: number;
}

export interface ApiRole {
  id: string;
  roleType: string;
  scopeType: string;
  scopeId: string | null;
  startDate: string;
  endDate: string | null;
  rotation: {
    state: string;
    daysRemaining: number | null;
    progress: number | null;
    label: string;
  };
}

export interface ApiMe {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    status: string;
  } | null;
  org: { id: string };
  holdings: ApiHolding[];
  pods: ApiPod[];
  roles: ApiRole[];
  isHubUser: boolean;
  today: string;
}

export interface DemoUser {
  id: string;
  email: string;
  fullName: string;
  roleSummary: string;
  podNames: string[];
}
