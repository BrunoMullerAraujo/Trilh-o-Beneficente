export const REGISTRATION_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  CANCELLED: "cancelled",
} as const;

export type RegistrationStatus =
  (typeof REGISTRATION_STATUS)[keyof typeof REGISTRATION_STATUS];

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  [REGISTRATION_STATUS.PENDING]: "Pendente",
  [REGISTRATION_STATUS.APPROVED]: "Pago",
  [REGISTRATION_STATUS.CANCELLED]: "Cancelado",
};

export const REGISTRATION_STATUS_FILTER_OPTIONS = [
  { value: REGISTRATION_STATUS.APPROVED, label: "Aprovados" },
  { value: REGISTRATION_STATUS.PENDING, label: "Pendentes" },
  { value: REGISTRATION_STATUS.CANCELLED, label: "Cancelados" },
] as const;

export const REGISTRATION_ALLOWED_AMOUNTS = [30, 50, 100] as const;

export interface EventConfig {
  id?: string;
  title: string;
  description: string;
  date: string;
  targetAmount: number;
  allowedAmounts: number[];
  active: boolean;
  termsText: string;
}

export const DEFAULT_EVENT_CONFIG: EventConfig = {
  title: "Sua participação transforma vidas.",
  description: "Participe do nosso 2º Mega Evento Solidário. 100% da arrecadação é destinada a projetos de impacto local.",
  date: "",
  targetAmount: 15000,
  allowedAmounts: [...REGISTRATION_ALLOWED_AMOUNTS],
  active: true,
  termsText: "Aceito os termos do evento e autorizo o uso dos meus dados para fins de confirmação de inscrição e prestação de contas.",
};

export function isApprovedStatus(status: unknown): status is typeof REGISTRATION_STATUS.APPROVED {
  return status === REGISTRATION_STATUS.APPROVED;
}

export function isAllowedRegistrationAmount(amount: unknown, allowedAmounts: ReadonlyArray<number> = REGISTRATION_ALLOWED_AMOUNTS): amount is number {
  return typeof amount === "number" && allowedAmounts.includes(amount);
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  targetAmount: number;
  allowedAmounts: number[];
  active: boolean;
  termsText: string;
}

export interface Registration {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  status: RegistrationStatus;
  paymentId: string;
  pixCode: string;
  qrCode: string;
  amount: number;
  createdAt: string;
}
