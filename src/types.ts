export interface Event {
  id: string;
  title: string;
  description: string;
  price: number;
  date: string;
  targetAmount?: number;
}

export interface Registration {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  status: "pending" | "approved" | "cancelled";
  paymentId: string;
  pixCode: string;
  qrCode: string;
  amount: number;
  createdAt: string;
}
