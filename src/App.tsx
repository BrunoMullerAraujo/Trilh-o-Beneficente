import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams } from "react-router-dom";
import {
  Heart,
  ChevronRight,
  QrCode,
  CheckCircle,
  LayoutDashboard,
  User,
  Mail,
  Smartphone,
  CreditCard,
  Copy,
  Clock,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  Users,
  MapPin,
  Calendar,
  Trophy,
  HandHeart,
  Hash,
  Bike,
  UserCheck,
  Loader2,
  Mountain,
  Zap,
  Flag,
  Shirt,
  AlertTriangle,
  Minus,
  Plus,
  X,
  XCircle,
  LogIn,
  LogOut,
  MoreHorizontal,
  FileText,
  Printer,
  Ticket
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import QRCodeLib from "qrcode";
import { db, auth, googleProvider, handleFirestoreError, OperationType } from "./lib/firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
  setDoc,
  Timestamp,
  limit,
  runTransaction
} from "firebase/firestore";
import { signInWithPopup, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";

import * as XLSX from "xlsx";
import jsQR from "jsqr";

// --- Constants ---
const EVENT_PRICE = 1;
const VOUCHER_PRICE = 0.10;

// --- Helpers ---

function formatCurrency(amount: number | string): string {
  return Number(amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isValidCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== Number(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === Number(d[10]);
}

function maskCPF(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

// --- Components ---

const isLocalDevelopment = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

function formatCPF(cpf: string) {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}
const useMercadoPagoTestBuyer = import.meta.env.VITE_MERCADO_PAGO_TEST_BUYER === "true";
const mercadoPagoPublicKey = import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY || "";
const shouldPrefillTestBuyer = isLocalDevelopment && useMercadoPagoTestBuyer;

const mercadoPagoBuyerTestData = {
  name: "TESTUSER1707 Comprador",
  birthDate: "1990-01-01",
  cpf: "33955753380",
  email: "TESTUSER1707@testuser.com",
  phone: "11999999999",
  cep: "38780000",
  street: "Rua Teste",
  number: "575338",
  neighborhood: "Centro",
  city: "Presidente Olegario",
  state: "MG",
  motorcycle: "Honda CG 160 2022 Vermelha",
};

declare global {
  interface Window {
    MercadoPago: any;
    MP_DEVICE_SESSION_ID?: string;
  }
}

function initMercadoPagoSDK() {
  const publicKey = mercadoPagoPublicKey;
  if (publicKey && window.MercadoPago) {
    try {
      new window.MercadoPago(publicKey, { locale: "pt-BR" });
    } catch (_) {}
  }
}

if (document.readyState === "complete") {
  initMercadoPagoSDK();
} else {
  window.addEventListener("load", initMercadoPagoSDK);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeout));
  });
}

const Navbar = ({ isAdmin }: { isAdmin: boolean }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  return (
    <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50 print-hidden">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl text-brand-black min-w-0">
          <Heart className="text-brand-yellow fill-brand-yellow flex-shrink-0" size={20} />
          <span className="tracking-tighter truncate">Trilhão Beneficente</span>
        </Link>
        <div className="flex gap-2 items-center flex-shrink-0">
          {user && (
            <Link to="/admin" className="flex items-center gap-2 bg-brand-yellow/90 hover:bg-brand-yellow text-brand-black font-black text-sm px-3 py-2 rounded-xl transition-all shadow-sm">
              <LayoutDashboard size={18} className="flex-shrink-0" />
              <span className="hidden sm:inline whitespace-nowrap">Painel Admin</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

const SHIRT_SIZES = ['P', 'M', 'G', 'GG', 'XGG', 'EX'] as const;
const LOW_STOCK_THRESHOLD = 15;

const LandingPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingCep, setLoadingCep] = useState(false);
  const [cepError, setCepError] = useState("");
  const [cpfError, setCpfError] = useState("");
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [existingReg, setExistingReg] = useState<{ id: string; data: any } | null>(null);
  const [checkingCpf, setCheckingCpf] = useState(false);
  const [allowMultipleCpf, setAllowMultipleCpf] = useState(false);
  const [voucherNames, setVoucherNames] = useState<string[]>([]);

  useEffect(() => {
    const unsubInventory = onSnapshot(doc(db, "settings", "shirt_inventory"), (snap) => {
      if (snap.exists()) setInventory(snap.data() as Record<string, number>);
    });
    const unsubConfig = onSnapshot(doc(db, "settings", "event_config"), (snap) => {
      if (snap.exists()) setAllowMultipleCpf(snap.data().allowMultipleCpf === true);
    });
    return () => { unsubInventory(); unsubConfig(); };
  }, []);

  const [birthDay, setBirthDay] = useState(shouldPrefillTestBuyer ? "01" : "");
  const [birthMonth, setBirthMonth] = useState(shouldPrefillTestBuyer ? "01" : "");
  const [birthYear, setBirthYear] = useState(shouldPrefillTestBuyer ? "1990" : "");

  const birthDateIso = (() => {
    const d = birthDay.padStart(2, "0");
    const m = birthMonth.padStart(2, "0");
    const y = birthYear;
    if (d && m && y.length === 4) return `${y}-${m}-${d}`;
    return "";
  })();

  const [formData, setFormData] = useState({
    name: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.name : "",
    cpf: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.cpf : "",
    email: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.email : "",
    phone: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.phone : "",
    emergencyName: "",
    emergencyPhone: "",
    guardianName: "",
    guardianCpf: "",
    cep: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.cep : "",
    street: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.street : "",
    number: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.number : "",
    neighborhood: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.neighborhood : "",
    city: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.city : "",
    state: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.state : "",
    motorcycle: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.motorcycle : "",
    shirtSize: "",
    amount: EVENT_PRICE,
    termsAccepted: shouldPrefillTestBuyer,
  });

  const isMinor = (() => {
    if (!birthDateIso) return false;
    const birth = new Date(birthDateIso);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age < 18;
  })();

  const set = (field: string, value: any) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleCepChange = async (cep: string) => {
    set("cep", cep);
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      setCepError("");
      return;
    }
    setLoadingCep(true);
    setCepError("");
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await resp.json();
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          cep,
          street: data.logradouro || prev.street,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }));
      }
    } catch {
      setCepError("Não foi possível buscar o CEP. Preencha o endereço manualmente.");
    }
    setLoadingCep(false);
  };

  const checkCpfDuplicate = async (cpf: string) => {
    const digits = cpf.replace(/\D/g, "");
    if (digits.length !== 11) { setExistingReg(null); return; }
    setCheckingCpf(true);
    try {
      const resp = await fetch(`/api/registrations/check-cpf?cpf=${digits}`);
      const data = await resp.json();
      if (data.duplicate) {
        setExistingReg({ id: data.existingId, data: data.existingData });
      } else {
        setExistingReg(null);
      }
    } catch {
      setExistingReg(null);
    }
    setCheckingCpf(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.termsAccepted) {
      alert("Você precisa aceitar os termos de uso.");
      return;
    }
    if (!birthDateIso) {
      alert("Preencha a data de nascimento completa (dia, mês e ano).");
      return;
    }
    const allSizesUnavailable = SHIRT_SIZES.every(s => (inventory[s] ?? 0) <= 0);
    if (!allSizesUnavailable) {
      if (!formData.shirtSize) {
        alert("Selecione o tamanho da camiseta.");
        return;
      }
      const sizeQty = inventory[formData.shirtSize] ?? 0;
      if (sizeQty <= 0) {
        alert("O tamanho selecionado não está mais disponível. Escolha outro.");
        return;
      }
    }
    if (voucherNames.some(n => !n.trim())) {
      alert("Preencha o nome de todos os acompanhantes dos vouchers.");
      return;
    }
    const cpfDigitsCheck = formData.cpf.replace(/\D/g, "");
    if (cpfDigitsCheck.length !== 11 || !isValidCPF(formData.cpf)) {
      setCpfError("CPF inválido. Verifique os dígitos.");
      document.querySelector<HTMLInputElement>("input[placeholder='000.000.000-00']")?.focus();
      return;
    }
    const totalAmount = parseFloat((EVENT_PRICE + voucherNames.length * VOUCHER_PRICE).toFixed(2));
    setLoading(true);
    setLoadingMessage("Gerando Pix...");

    try {
      const resp = await withTimeout(fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_amount: totalAmount,
          description: "Inscrição Evento Beneficente",
          device_session_id: window.MP_DEVICE_SESSION_ID || null,
          payer: {
            email: formData.email,
            first_name: formData.name.split(" ")[0],
            last_name: formData.name.split(" ").slice(1).join(" ") || "Participante",
            identification: {
              type: "CPF",
              number: formData.cpf.replace(/\D/g, "")
            }
          }
        })
      }), 20000, "O Mercado Pago demorou para responder. Tente novamente em alguns segundos.");

      // Check if response is JSON
      const contentType = resp.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await resp.text();
        console.error("Non-JSON response received:", text);
        throw new Error(`O servidor retornou uma resposta inválida (não JSON). Status: ${resp.status}. Certifique-se de que o servidor backend está rodando corretamente.`);
      }

      const mpData = await resp.json();

      if (resp.status === 409 && mpData.error === "cpf_duplicate") {
        setLoading(false);
        setLoadingMessage("");
        setExistingReg({ id: mpData.existingId, data: mpData.existingData });
        return;
      }

      if (!resp.ok) {
        throw new Error(mpData.message || mpData.error || `Erro do servidor (${resp.status})`);
      }

      // 2. Save registration with status 'pending' to Firestore (atomic: counter + document)
      setLoadingMessage("Salvando inscrição...");
      const newRegRef = doc(collection(db, "registrations"));
      const counterRef = doc(db, "settings", "registration_counter");
      try {
        await withTimeout(runTransaction(db, async (tx) => {
          const counterSnap = await tx.get(counterRef);
          const lastNumber = counterSnap.exists() ? (counterSnap.data().lastNumber ?? 0) : 0;
          const nextNumber = lastNumber + 1;
          const registrationNumber = String(nextNumber).padStart(4, "0");
          tx.set(counterRef, { lastNumber: nextNumber });
          tx.set(newRegRef, {
            ...formData,
            birthDate: birthDateIso,
            cpf: formData.cpf.replace(/\D/g, ""),
            guardianCpf: formData.guardianCpf ? formData.guardianCpf.replace(/\D/g, "") : "",
            registrationNumber,
            status: "pending",
            paymentId: String(mpData.id),
            orderId: mpData.orderId || "",
            pixCode: mpData.point_of_interaction?.transaction_data?.qr_code_base64 || "",
            copyPaste: mpData.point_of_interaction?.transaction_data?.qr_code || "",
            shirtSize: formData.shirtSize,
            amount: totalAmount,
            vouchers: voucherNames.map((name, i) => ({
              code: `${newRegRef.id.slice(0, 6).toUpperCase()}-V${String(i + 1).padStart(2, "0")}`,
              name: name.trim(),
              used: false,
            })),
            createdAt: new Date().toISOString(),
          });
        }), 15000, "O Pix foi gerado, mas o Firestore demorou para salvar a inscrição. Verifique se o Firestore Database foi criado e se as regras foram publicadas.");
      } catch (error) {
        console.error("Erro ao salvar inscrição no Firestore:", error);
        throw new Error("O Pix foi gerado, mas não foi possível salvar a inscrição no Firestore. Verifique se o Firestore Database foi criado e se as regras foram publicadas.");
      }
      const docRef = newRegRef;

      // Dispara e-mail de inscrição pendente (fire-and-forget)
      fetch(`/api/email/pending/${docRef.id}`, { method: "POST" }).catch(() => {});

      setLoading(false);
      navigate(`/payment/${docRef.id}`);
    } catch (error: any) {
      console.error("Erro ao registrar:", error);
      alert(`Erro: ${error.message}`);
      setLoading(false);
      setLoadingMessage("");
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar isAdmin={false} />

      {!import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY && (
        <div className="bg-amber-50 border-b border-amber-100 p-3 text-center">
          <p className="text-xs text-amber-700 font-medium flex items-center justify-center gap-2">
            <ShieldCheck size={13} />
            Atenção: Configure as chaves de API em Settings &gt; Secrets para aceitar pagamentos reais.
          </p>
        </div>
      )}

      {/* Hero */}
      <section className="relative bg-brand-black overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(ellipse at 10% 60%, rgba(255,200,0,0.08) 0%, transparent 55%), radial-gradient(ellipse at 90% 10%, rgba(255,200,0,0.06) 0%, transparent 50%)" }} />
        {/* Faixa diagonal decorativa */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-brand-yellow" />
        <div className="relative max-w-5xl mx-auto px-4 pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-10">
            {/* Texto */}
            <div className="flex-1">
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="inline-flex items-center gap-2 bg-brand-yellow/10 border border-brand-yellow/30 text-brand-yellow text-xs font-black uppercase tracking-widest px-4 py-2 rounded-full mb-6">
                <Trophy size={13} />
                8ª Edição · 2026
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="text-5xl md:text-6xl lg:text-7xl font-black text-white tracking-tight leading-none mb-5"
              >
                Trilhão<br />
                <span className="text-brand-yellow">Beneficente</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="text-gray-400 text-base md:text-lg max-w-lg mb-8 leading-relaxed"
              >
                Oito edições. Uma causa. O maior encontro de moto offroad solidário do Alto Paranaíba transforma adrenalina em esperança — 100% da arrecadação vai para a <strong className="text-white">ASSOAPAC</strong>, que apoia pacientes com câncer em Presidente Olegário.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex flex-wrap gap-5 text-sm text-gray-400"
              >
                <div className="flex items-center gap-2">
                  <MapPin size={15} className="text-brand-yellow flex-shrink-0" />
                  <span>Presidente Olegário — MG</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mountain size={15} className="text-brand-yellow flex-shrink-0" />
                  <span>Trilha Offroad</span>
                </div>
                <div className="flex items-center gap-2">
                  <HandHeart size={15} className="text-brand-yellow flex-shrink-0" />
                  <span>100% revertido à ASSOAPAC</span>
                </div>
              </motion.div>
            </div>

            {/* Card destaque lateral */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 }}
              className="flex-shrink-0 w-full md:w-64"
            >
              <a href="#inscricao" className="block bg-brand-yellow rounded-3xl p-6 text-brand-black shadow-2xl shadow-brand-yellow/20 hover:scale-105 transition-transform cursor-pointer">
                <Flag size={28} className="mb-3" />
                <div className="text-2xl font-black leading-tight mb-1">Inscreva-se agora</div>
                <div className="text-sm font-bold opacity-70 mb-3">R$ 1,00 · PIX imediato</div>
                <div className="bg-black/10 rounded-xl px-3 py-2 text-xs font-bold mb-3">
                  Inscrições até 11/07/2026
                </div>
                <div className="flex items-center gap-2 font-black text-sm">
                  <span>Garantir vaga</span>
                  <ChevronRight size={18} />
                </div>
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Sobre o evento */}
      <section className="bg-gray-50 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-14 grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col gap-3">
            <div className="w-12 h-12 bg-brand-black rounded-2xl flex items-center justify-center">
              <Mountain className="text-brand-yellow" size={22} />
            </div>
            <h3 className="font-black text-brand-black text-lg">8ª edição em 2026</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Em 2026 celebramos oito anos de um evento que nasceu da paixão pelas trilhas e cresceu como símbolo de solidariedade no Alto Paranaíba.
            </p>
          </div>
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col gap-3">
            <div className="w-12 h-12 bg-brand-black rounded-2xl flex items-center justify-center">
              <HandHeart className="text-brand-yellow" size={22} />
            </div>
            <h3 className="font-black text-brand-black text-lg">100% para a ASSOAPAC</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              A Associação de Apoio ao Paciente com Câncer de Presidente Olegário (ASSOAPAC) atua oferecendo todo tipo de assistência e apoio emocional às pessoas que enfrentam a árdua luta contra o câncer e suas famílias. Toda contribuição arrecadada é revertida diretamente para ajudar essa causa.
            </p>
          </div>
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col gap-3">
            <div className="w-12 h-12 bg-brand-black rounded-2xl flex items-center justify-center">
              <Zap className="text-brand-yellow" size={22} />
            </div>
            <h3 className="font-black text-brand-black text-lg">Inscrição rápida via PIX</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Preencha os dados do piloto e pague via PIX. A confirmação chega na hora — sem burocracia, sem espera. Sua inscrição é sua contribuição.
            </p>
          </div>
        </div>
      </section>

      {/* Formulário de inscrição */}
      <section className="bg-gray-50/40 border-t border-gray-100" id="inscricao">
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-20">
          <div className="grid xl:grid-cols-[1fr_360px] gap-8 items-start">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/30 overflow-hidden">
              <div className="px-6 md:px-10 pt-8 pb-6 border-b border-gray-100">
                <span className="text-xs font-black text-brand-yellow bg-brand-black px-3 py-1.5 rounded-full uppercase tracking-widest">Inscrições abertas</span>
                <h2 className="text-3xl font-black text-brand-black mt-4 tracking-tight">Ficha de Inscrição</h2>
                <p className="text-gray-500 text-sm mt-1.5 leading-relaxed">Preencha os dados do piloto e pague via PIX para confirmar sua participação.</p>
              </div>
              <form onSubmit={handleSubmit} className="px-6 md:px-10 py-8 space-y-8">

              {/* Dados do Piloto */}
              <div>
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-7 h-7 bg-brand-black rounded-lg flex items-center justify-center flex-shrink-0">
                    <User size={13} className="text-brand-yellow" />
                  </div>
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Dados do Piloto</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome Completo</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                      <input required autoComplete="name" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base bg-gray-50/50 focus:bg-white" placeholder="João da Silva" value={formData.name} onChange={e => set("name", e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Data de Nascimento</label>
                      <div className="flex gap-2">
                        <input
                          required
                          inputMode="numeric"
                          maxLength={2}
                          placeholder="DD"
                          className="w-16 px-2 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base text-center bg-gray-50/50 focus:bg-white"
                          value={birthDay}
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                            setBirthDay(v);
                            if (v.length === 2) (e.currentTarget.form?.querySelector('[name="birthMonth"]') as HTMLInputElement | null)?.focus();
                          }}
                        />
                        <input
                          required
                          name="birthMonth"
                          inputMode="numeric"
                          maxLength={2}
                          placeholder="MM"
                          className="w-16 px-2 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base text-center bg-gray-50/50 focus:bg-white"
                          value={birthMonth}
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                            setBirthMonth(v);
                            if (v.length === 2) (e.currentTarget.form?.querySelector('[name="birthYear"]') as HTMLInputElement | null)?.focus();
                          }}
                        />
                        <input
                          required
                          name="birthYear"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="AAAA"
                          className="flex-1 px-2 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base text-center bg-gray-50/50 focus:bg-white"
                          value={birthYear}
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                            setBirthYear(v);
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">Dia · Mês · Ano</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">CPF</label>
                      <div className="relative">
                        <CreditCard className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                        <input required inputMode="numeric" autoComplete="off" maxLength={14} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base bg-gray-50/50 focus:bg-white" placeholder="000.000.000-00" value={formData.cpf} onChange={e => {
                          const masked = maskCPF(e.target.value);
                          set("cpf", masked);
                          const digits = masked.replace(/\D/g, "");
                          if (digits.length === 11) {
                            if (!isValidCPF(masked)) {
                              setCpfError("CPF inválido. Verifique os dígitos.");
                            } else {
                              setCpfError("");
                              checkCpfDuplicate(masked);
                            }
                          } else {
                            setCpfError("");
                            checkCpfDuplicate(masked);
                          }
                        }} />
                        {checkingCpf && <span className="absolute right-3 top-3.5 text-xs text-gray-400">verificando...</span>}
                      </div>
                      {cpfError && <p className="text-red-500 text-xs mt-1.5">{cpfError}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">WhatsApp</label>
                      <div className="relative">
                        <Smartphone className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                        <input required type="tel" inputMode="tel" autoComplete="tel" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base bg-gray-50/50 focus:bg-white" placeholder="(34) 99999-9999" value={formData.phone} onChange={e => set("phone", e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                        <input required type="email" inputMode="email" autoComplete="email" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base bg-gray-50/50 focus:bg-white" placeholder="joao@email.com" value={formData.email} onChange={e => set("email", e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100" />

              {/* Contato de Emergência */}
              <div>
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-7 h-7 bg-brand-black rounded-lg flex items-center justify-center flex-shrink-0">
                    <Smartphone size={13} className="text-brand-yellow" />
                  </div>
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Contato de Emergência</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome do Contato</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                      <input required autoComplete="off" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base bg-gray-50/50 focus:bg-white" placeholder="Nome do familiar ou amigo" value={formData.emergencyName} onChange={e => set("emergencyName", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefone do Contato</label>
                    <div className="relative">
                      <Smartphone className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                      <input required type="tel" inputMode="tel" autoComplete="off" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base bg-gray-50/50 focus:bg-white" placeholder="(34) 99999-9999" value={formData.emergencyPhone} onChange={e => set("emergencyPhone", e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Responsável (menor de 18) */}
              <AnimatePresence>
                {isMinor && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
                          <UserCheck size={13} className="text-white" />
                        </div>
                        <p className="text-xs font-black text-amber-700 uppercase tracking-widest">Responsável Legal (Piloto Menor de Idade)</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome Completo do Responsável</label>
                          <div className="relative">
                            <User className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                            <input required={isMinor} autoComplete="name" className="w-full pl-10 pr-4 py-3 border border-amber-200 bg-white rounded-xl focus:ring-2 focus:ring-brand-yellow outline-none text-base" placeholder="Maria da Silva" value={formData.guardianName} onChange={e => set("guardianName", e.target.value)} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">CPF do Responsável</label>
                          <div className="relative">
                            <CreditCard className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                            <input required={isMinor} inputMode="numeric" autoComplete="off" className="w-full pl-10 pr-4 py-3 border border-amber-200 bg-white rounded-xl focus:ring-2 focus:ring-brand-yellow outline-none text-base" placeholder="000.000.000-00" value={formData.guardianCpf} onChange={e => set("guardianCpf", e.target.value)} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="border-t border-gray-100" />

              {/* Endereço */}
              <div>
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-7 h-7 bg-brand-black rounded-lg flex items-center justify-center flex-shrink-0">
                    <MapPin size={13} className="text-brand-yellow" />
                  </div>
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Endereço</p>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">CEP</label>
                      <div className="relative">
                        <MapPin className="absolute left-3.5 top-3.5 text-gray-400" size={14} />
                        <input required inputMode="numeric" autoComplete="postal-code" className="w-full pl-9 pr-8 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base bg-gray-50/50 focus:bg-white" placeholder="00000-000" maxLength={9} value={formData.cep} onChange={e => handleCepChange(e.target.value)} />
                        {loadingCep && <Loader2 className="absolute right-2.5 top-3.5 text-gray-400 animate-spin" size={15} />}
                      </div>
                      {cepError && <p className="text-amber-600 text-xs mt-1.5">{cepError}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Número</label>
                      <div className="relative">
                        <Hash className="absolute left-3.5 top-3.5 text-gray-400" size={14} />
                        <input required inputMode="numeric" className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base bg-gray-50/50 focus:bg-white" placeholder="123" value={formData.number} onChange={e => set("number", e.target.value)} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Rua</label>
                    <input required autoComplete="address-line1" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base bg-gray-50/50 focus:bg-white" placeholder="Nome da rua" value={formData.street} onChange={e => set("street", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Bairro</label>
                      <input required autoComplete="address-level3" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base bg-gray-50/50 focus:bg-white" placeholder="Bairro" value={formData.neighborhood} onChange={e => set("neighborhood", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Cidade</label>
                      <input required autoComplete="address-level2" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base bg-gray-50/50 focus:bg-white" placeholder="Cidade" value={formData.city} onChange={e => set("city", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Estado</label>
                    <input required autoComplete="address-level1" maxLength={2} className="w-28 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base uppercase bg-gray-50/50 focus:bg-white" placeholder="UF" value={formData.state} onChange={e => set("state", e.target.value.toUpperCase())} />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100" />

              {/* Moto */}
              <div>
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-7 h-7 bg-brand-black rounded-lg flex items-center justify-center flex-shrink-0">
                    <Bike size={13} className="text-brand-yellow" />
                  </div>
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Motocicleta</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Descrição da Motocicleta</label>
                  <div className="relative">
                    <Bike className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                    <input required autoComplete="off" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow/50 transition-all outline-none text-base bg-gray-50/50 focus:bg-white" placeholder="Ex: Honda XR 190, 2021, Preta" value={formData.motorcycle} onChange={e => set("motorcycle", e.target.value)} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">Marca, modelo, ano e cor</p>
                </div>
              </div>

              <div className="border-t border-gray-100" />

              {/* Camiseta */}
              <div>
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-7 h-7 bg-brand-black rounded-lg flex items-center justify-center flex-shrink-0">
                    <Shirt size={13} className="text-brand-yellow" />
                  </div>
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Camiseta do Evento</p>
                </div>
                {(() => {
                  const allUnavailable = SHIRT_SIZES.every(s => (inventory[s] ?? 0) <= 0);
                  if (allUnavailable) {
                    return (
                      <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-2xl p-4">
                        <AlertTriangle size={18} className="text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-black text-gray-600">Camisetas esgotadas</p>
                          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">Todos os tamanhos estão esgotados no momento. Sua inscrição será registrada sem camiseta. Essa informação constará no seu comprovante.</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {SHIRT_SIZES.map((size) => {
                          const qty = inventory[size] ?? 0;
                          const unavailable = qty <= 0;
                          const lowStock = qty > 0 && qty < LOW_STOCK_THRESHOLD;
                          const selected = formData.shirtSize === size;
                          return (
                            <div key={size} className="flex flex-col items-center gap-1">
                              <button
                                type="button"
                                disabled={unavailable}
                                onClick={() => set("shirtSize", size)}
                                className={`w-full py-3.5 rounded-xl font-black text-sm border-2 transition-all
                                  ${unavailable ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed" :
                                    selected ? "border-brand-black bg-brand-black text-brand-yellow shadow-lg scale-105" :
                                    "border-gray-200 bg-white text-gray-700 hover:border-brand-black hover:bg-gray-50"}`}
                              >
                                {size}
                              </button>
                              {unavailable && <span className="text-[10px] text-gray-400 font-bold">Esgotado</span>}
                              {lowStock && <span className="text-[10px] text-amber-500 font-black flex items-center gap-0.5"><AlertTriangle size={9} />Esgotando</span>}
                            </div>
                          );
                        })}
                      </div>
                      {!formData.shirtSize && <p className="text-xs text-gray-400 mt-2.5">Selecione um tamanho para continuar.</p>}
                    </>
                  );
                })()}
              </div>

              {/* Voucher de Almoço */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-brand-black rounded-lg flex items-center justify-center flex-shrink-0">
                    <Ticket size={13} className="text-brand-yellow" />
                  </div>
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Voucher de Almoço — Acompanhantes</p>
                </div>
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                  <p className="text-xs text-gray-600 leading-relaxed mb-3">
                    Adquira vouchers de almoço para acompanhantes. Cada voucher garante uma refeição completa no dia do evento por{" "}
                    <strong className="text-brand-black">R$ 0,10</strong>. Informe o nome de cada acompanhante.
                  </p>
                  {voucherNames.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setVoucherNames([""])}
                      className="w-full border-2 border-dashed border-gray-300 rounded-xl py-3 text-sm font-bold text-gray-400 hover:border-brand-black hover:text-brand-black transition-all flex items-center justify-center gap-1.5"
                    >
                      <Plus size={15} />
                      Adicionar Voucher de Almoço
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {voucherNames.map((name, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <div className="flex-shrink-0 w-7 h-7 bg-brand-black rounded-lg flex items-center justify-center text-brand-yellow text-xs font-black">
                            {i + 1}
                          </div>
                          <input
                            type="text"
                            required
                            value={name}
                            onChange={e => {
                              const updated = [...voucherNames];
                              updated[i] = e.target.value;
                              setVoucherNames(updated);
                            }}
                            placeholder={`Nome do acompanhante ${i + 1}`}
                            className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-black placeholder-gray-300 focus:outline-none focus:border-brand-black transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setVoucherNames(voucherNames.filter((_, j) => j !== i))}
                            className="flex-shrink-0 p-2 text-gray-300 hover:text-red-500 transition-all rounded-lg hover:bg-red-50"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      {voucherNames.length < 10 && (
                        <button
                          type="button"
                          onClick={() => setVoucherNames([...voucherNames, ""])}
                          className="w-full border border-dashed border-gray-300 rounded-xl py-2.5 text-xs font-bold text-gray-400 hover:border-brand-black hover:text-brand-black transition-all flex items-center justify-center gap-1.5 mt-1"
                        >
                          <Plus size={13} />
                          Adicionar outro voucher
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Valor + Submit */}
              <div className="space-y-4 pt-2">
                <div className="bg-brand-black rounded-2xl p-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-brand-yellow/60 uppercase tracking-widest mb-0.5">
                      {voucherNames.length > 0 ? "Valor Total" : "Valor da Inscrição"}
                    </p>
                    <p className="text-2xl font-black text-brand-yellow">
                      {formatCurrency(EVENT_PRICE + voucherNames.length * VOUCHER_PRICE)}
                    </p>
                    {voucherNames.length > 0 && (
                      <p className="text-[10px] text-brand-yellow/50 mt-0.5">
                        Inscrição R$ {EVENT_PRICE.toFixed(2).replace(".", ",")} + {voucherNames.length}× Voucher R$ {VOUCHER_PRICE.toFixed(2).replace(".", ",")}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-0.5">Inscrições até</p>
                    <p className="text-sm font-black text-white">11/07/2026</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                  <input type="checkbox" id="terms" required className="mt-0.5 accent-brand-black w-4 h-4 flex-shrink-0" checked={formData.termsAccepted} onChange={e => set("termsAccepted", e.target.checked)} />
                  <label htmlFor="terms" className="text-xs text-gray-500 leading-relaxed cursor-pointer">
                    Aceito os termos do evento e autorizo o uso dos meus dados para confirmação de inscrição e prestação de contas à ASSOAPAC.
                  </label>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full bg-brand-black text-brand-yellow font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-all shadow-xl disabled:opacity-50 text-base tracking-wide">
                  {loading ? (
                    <><Loader2 size={18} className="animate-spin" /><span>{loadingMessage || "Processando..."}</span></>
                  ) : (
                    <><span>Confirmar Inscrição via PIX</span><ChevronRight size={20} /></>
                  )}
                </button>

                <p className="text-xs text-center text-gray-400 flex items-center justify-center gap-1.5">
                  <ShieldCheck size={13} />
                  Pagamento seguro via Mercado Pago
                </p>
              </div>
            </form>
          </div>

            {/* Painel direito */}
            <div className="hidden xl:flex flex-col gap-4 sticky top-20">
              <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
                <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                  <h3 className="text-sm font-black text-brand-black">Por que participar?</h3>
                </div>
                <div className="p-6 space-y-5">
                  {([
                    { icon: CheckCircle, title: "Confirmação instantânea", desc: "Pague via PIX e receba a confirmação da sua inscrição automaticamente, sem burocracia." },
                    { icon: Mountain, title: "Trilha Offroad", desc: "Percurso desafiador em terreno offroad pelas estradas e campos ao redor de Presidente Olegário — MG." },
                    { icon: HandHeart, title: "100% para a ASSOAPAC", desc: "Cada real arrecadado custeia transporte, alimentação e suporte a pacientes com câncer e suas famílias." },
                    { icon: Bike, title: "Todas as motos bem-vindas", desc: "O evento é aberto a motociclistas de todos os estilos e cilindradas que queiram unir aventura e solidariedade." },
                  ] as const).map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="flex gap-3 items-start">
                      <div className="w-9 h-9 bg-brand-black rounded-xl flex items-center justify-center flex-shrink-0">
                        <Icon size={16} className="text-brand-yellow" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800 text-sm">{title}</h4>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      <footer className="bg-brand-black border-t border-white/5 py-10 mt-4">
        <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-white/40">
            <Heart size={16} className="fill-brand-yellow text-brand-yellow" />
            <span className="text-sm font-bold">8º Trilhão Beneficente &copy; 2026 — Presidente Olegário, MG</span>
          </div>
          <div className="flex gap-6 text-xs font-bold text-white/30 uppercase tracking-widest">
            <span>Beneficiada: ASSOAPAC</span>
            <Link to="/admin" className="hover:text-white/60 transition-all flex items-center gap-1">
              <ShieldCheck size={12} />
              Organizadores
            </Link>
          </div>
        </div>
      </footer>

      {/* Modal: CPF já inscrito */}
      <AnimatePresence>
        {existingReg && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setExistingReg(null)}
              className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden"
            >
              {existingReg.data.status === "approved" ? (
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                    <CheckCircle size={36} className="text-green-600" />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 mb-1">Inscrição Confirmada!</h3>
                  <p className="text-gray-500 text-sm mb-6">Este CPF já possui inscrição paga e confirmada.</p>
                  <div className="bg-gray-50 rounded-2xl p-5 text-left space-y-3 mb-6">
                    {existingReg.data.registrationNumber && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Nº Inscrição</span>
                        <span className="font-black font-mono text-brand-black">#{existingReg.data.registrationNumber}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Participante</span>
                      <span className="font-bold text-gray-900 truncate max-w-[180px]">{existingReg.data.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Valor</span>
                      <span className="font-bold text-gray-900">{formatCurrency(existingReg.data.amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Status</span>
                      <span className="font-black text-green-600 uppercase text-xs">Pago ✓</span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/payment/${existingReg.id}`)}
                    className="w-full bg-brand-black text-brand-yellow font-bold py-4 rounded-2xl hover:bg-gray-800 transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <ExternalLink size={18} />
                    Ver Comprovante
                  </button>
                  <button onClick={() => setExistingReg(null)} className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-all font-medium">
                    Fechar
                  </button>
                </div>
              ) : (
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
                    <Clock size={36} className="text-amber-600" />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 mb-1">Pagamento Pendente</h3>
                  <p className="text-gray-500 text-sm mb-6">Este CPF já possui uma inscrição aguardando pagamento.</p>
                  <div className="bg-gray-50 rounded-2xl p-5 text-left space-y-3 mb-6">
                    {existingReg.data.registrationNumber && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Nº Inscrição</span>
                        <span className="font-black font-mono text-brand-black">#{existingReg.data.registrationNumber}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Participante</span>
                      <span className="font-bold text-gray-900 truncate max-w-[180px]">{existingReg.data.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Valor</span>
                      <span className="font-bold text-gray-900">{formatCurrency(existingReg.data.amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Status</span>
                      <span className="font-black text-amber-600 uppercase text-xs">Aguardando PIX</span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/payment/${existingReg.id}`)}
                    className="w-full bg-brand-black text-brand-yellow font-bold py-4 rounded-2xl hover:bg-gray-800 transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <QrCode size={18} />
                    Continuar Pagamento PIX
                  </button>
                  <button onClick={() => setExistingReg(null)} className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-all font-medium">
                    Fechar
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

function fmtBirth(iso: string | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function fmtConfirmedAt(field: any): string {
  if (!field) return "—";
  try {
    const date = field?.toDate ? field.toDate() : new Date(field);
    return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}
function shirtLabel(s: string): string {
  const m: Record<string, string> = { P: "P — Pequeno", M: "M — Médio", G: "G — Grande", GG: "GG — Extra Grande", XGG: "XGG — Extra Extra Grande", EX: "EX — Especial" };
  return m[s] || s || "—";
}

const PaymentPage = () => {
  const { id } = useParams();
  const [reg, setReg] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [checkinQr, setCheckinQr] = useState("");
  const [voucherQrs, setVoucherQrs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "registrations", id), (snap) => {
      if (snap.exists()) {
        setReg(snap.data());
      } else {
        setReg(undefined);
        setNotFound(true);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `registrations/${id}`);
    });
    return unsub;
  }, [id]);

  useEffect(() => {
    if (!reg || reg.status !== "pending") return;
    const createdAt = reg.createdAt instanceof Object && reg.createdAt?.toDate
      ? reg.createdAt.toDate()
      : new Date(reg.createdAt);
    const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
    const calc = () => Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    setTimeLeft(calc());
    const interval = setInterval(() => {
      const left = calc();
      setTimeLeft(left);
      if (left <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [reg]);

  useEffect(() => {
    if (reg?.status === "approved" && id) {
      const url = `${window.location.origin}/checkin/${id}`;
      QRCodeLib.toDataURL(url, { width: 200, margin: 1, color: { dark: "#111827", light: "#ffffff" } })
        .then(setCheckinQr)
        .catch(() => {});
    }
  }, [reg?.status, id]);

  useEffect(() => {
    if (!reg?.vouchers?.length || !id) return;
    const origin = window.location.origin;
    Promise.all(
      (reg.vouchers as any[]).map(async (v: any) => {
        const url = `${origin}/validar-voucher/${id}/${v.code}`;
        const dataUrl = await QRCodeLib.toDataURL(url, { width: 160, margin: 1, color: { dark: "#111827", light: "#ffffff" } });
        return [v.code, dataUrl] as [string, string];
      })
    ).then(pairs => setVoucherQrs(Object.fromEntries(pairs))).catch(() => {});
  }, [reg?.status, id]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(reg.copyPaste);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback para browsers sem permissão de clipboard
      const el = document.createElement("textarea");
      el.value = reg.copyPaste;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8">
        <AlertTriangle size={48} className="mx-auto mb-4 text-amber-500" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Inscrição não encontrada</h2>
        <p className="text-gray-500 mb-6">O link pode estar incorreto ou ter expirado.</p>
        <Link to="/" className="bg-brand-black text-brand-yellow font-bold px-6 py-3 rounded-2xl hover:bg-gray-800 transition-all">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
  if (!reg) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8">
        <Loader2 size={48} className="mx-auto mb-4 text-brand-black animate-spin" />
        <p className="text-gray-500 font-medium">Carregando seu PIX...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar isAdmin={false} />
      <main className={`mx-auto px-4 py-12 ${reg.status === "approved" ? "max-w-2xl" : "max-w-lg"}`}>
        <AnimatePresence mode="wait">
          {reg.status === 'approved' ? (
            <motion.div
              key="success"
              id="comprovante"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-3xl shadow-2xl border border-gray-200"
            >
              {/* Header */}
              <div className="bg-brand-black px-8 pt-8 pb-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black text-brand-yellow/60 uppercase tracking-[0.2em] mb-2">8ª Edição · 2026 · Presidente Olegário — MG</p>
                    <h1 className="text-2xl font-black text-brand-yellow leading-tight">Trilhão da Solidariedade</h1>
                    <p className="text-xs text-white/40 mt-1">100% revertido à ASSOAPAC</p>
                    <div className="mt-4 inline-flex items-center gap-1.5 bg-green-600 text-white text-xs font-black px-4 py-1.5 rounded-full">
                      <CheckCircle size={12} />
                      INSCRIÇÃO CONFIRMADA
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] font-black text-brand-yellow/50 uppercase tracking-widest mb-1">Inscrição Nº</p>
                    <p className="text-4xl font-black text-brand-yellow leading-none">#{reg.registrationNumber || "—"}</p>
                  </div>
                </div>
              </div>

              {/* Warning banner */}
              <div className="bg-amber-50 border-l-4 border-amber-400 px-6 py-3 flex items-start gap-3">
                <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-amber-800 leading-relaxed">
                  Apresente este comprovante (impresso ou digital) na recepção do evento para realizar seu credenciamento.
                </p>
              </div>

              {/* QR Code + resumo rápido */}
              <div className="bg-white px-8 py-6 flex gap-6 items-start border-b border-gray-100">
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-base font-black text-brand-black">{reg.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Piloto</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-brand-black">{reg.motorcycle || "—"}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Motocicleta</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-brand-black">{shirtLabel(reg.shirtSize)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Camiseta</p>
                  </div>
                </div>
                <div className="flex-shrink-0 text-center">
                  {checkinQr ? (
                    <img src={checkinQr} alt="QR Code para check-in" className="w-28 h-28 rounded-lg border-2 border-brand-yellow" />
                  ) : (
                    <div className="w-28 h-28 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Loader2 size={22} className="animate-spin text-gray-400" />
                    </div>
                  )}
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">QR · Check-in</p>
                </div>
              </div>

              {/* Sections */}
              <div className="bg-white divide-y divide-gray-100">

                {/* Dados do Piloto */}
                <div>
                  <div className="bg-brand-black px-8 py-2.5">
                    <p className="text-[11px] font-black text-brand-yellow uppercase tracking-widest">Dados do Piloto</p>
                  </div>
                  <div className="px-8 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
                    {([
                      ["Nome Completo", reg.name],
                      ["CPF", formatCPF(reg.cpf)],
                      ["Data de Nascimento", fmtBirth(reg.birthDate)],
                      ["WhatsApp", reg.phone || "—"],
                      ["E-mail", reg.email || "—"],
                      ["Cidade / Estado", reg.city && reg.state ? `${reg.city} / ${reg.state}` : (reg.city || "—")],
                    ] as [string, string][]).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                        <p className="text-sm font-bold text-brand-black truncate">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dados do Evento */}
                <div>
                  <div className="bg-brand-black px-8 py-2.5">
                    <p className="text-[11px] font-black text-brand-yellow uppercase tracking-widest">Dados do Evento</p>
                  </div>
                  <div className="px-8 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
                    {([
                      ["Valor Pago", formatCurrency(reg.amount)],
                      ["Confirmação do Pagamento", fmtConfirmedAt(reg.confirmedAt)],
                      ["Motocicleta", reg.motorcycle || "—"],
                      ["ID do Pagamento", reg.paymentId || "—"],
                    ] as [string, string][]).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                        <p className="text-sm font-bold text-brand-black truncate">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contato de Emergência */}
                <div>
                  <div className="bg-brand-black px-8 py-2.5">
                    <p className="text-[11px] font-black text-brand-yellow uppercase tracking-widest">Contato de Emergência</p>
                  </div>
                  <div className="px-8 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
                    {([
                      ["Nome do Contato", reg.emergencyName || "—"],
                      ["Telefone", reg.emergencyPhone || "—"],
                    ] as [string, string][]).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                        <p className="text-sm font-bold text-brand-black">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Responsável Legal (se menor) */}
                {reg.guardianName && (
                  <div>
                    <div className="bg-amber-500 px-8 py-2.5">
                      <p className="text-[11px] font-black text-white uppercase tracking-widest">Responsável Legal</p>
                    </div>
                    <div className="px-8 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
                      {([
                        ["Nome do Responsável", reg.guardianName],
                        ["CPF do Responsável", formatCPF(reg.guardianCpf)],
                      ] as [string, string][]).map(([label, value]) => (
                        <div key={label}>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                          <p className="text-sm font-bold text-brand-black">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Vouchers de Almoço */}
                {reg.vouchers?.length > 0 && (
                  <div>
                    <div className="bg-brand-black px-8 py-2.5">
                      <p className="text-[11px] font-black text-brand-yellow uppercase tracking-widest">Vouchers de Almoço — Acompanhantes</p>
                    </div>
                    <div className="px-8 py-5 space-y-4">
                      {(reg.vouchers as any[]).map((v: any, i: number) => (
                        <div key={v.code} className={`border rounded-2xl overflow-hidden ${v.used ? "border-gray-200 opacity-60" : "border-brand-yellow/30"}`}>
                          <div className={`px-4 py-2 flex items-center justify-between ${v.used ? "bg-gray-100" : "bg-brand-black/5"}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-gray-500">Voucher {i + 1}</span>
                              <span className="text-xs font-mono text-gray-400">{v.code}</span>
                            </div>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${v.used ? "bg-gray-200 text-gray-500" : "bg-green-100 text-green-700"}`}>
                              {v.used ? "Utilizado" : "Válido"}
                            </span>
                          </div>
                          <div className="p-4 flex items-center gap-4">
                            <div className="flex-1">
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Acompanhante</p>
                              <p className="text-base font-black text-brand-black">{v.name}</p>
                              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                                Apresente o QR Code ao lado na entrada do almoço para validação.
                              </p>
                            </div>
                            <div className="flex-shrink-0 text-center">
                              {voucherQrs[v.code] ? (
                                <img src={voucherQrs[v.code]} alt={`QR Voucher ${v.code}`} className="w-20 h-20 rounded-lg" />
                              ) : (
                                <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center">
                                  <Loader2 size={18} className="animate-spin text-gray-400" />
                                </div>
                              )}
                              <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mt-1">QR · Almoço</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Orientações */}
                <div>
                  <div className="bg-brand-black px-8 py-2.5">
                    <p className="text-[11px] font-black text-brand-yellow uppercase tracking-widest">Orientações para o Dia do Evento</p>
                  </div>
                  <div className="px-8 py-5 space-y-2.5">
                    {[
                      "Apresente este comprovante (impresso ou digital) na recepção para realizar o check-in e assinar o Termo de Responsabilidade.",
                      "Leve documento oficial com foto (RG ou CNH) para conferência dos dados.",
                      "A organização poderá verificar a motocicleta e os equipamentos de proteção individual.",
                      "A entrega da camiseta seguirá as regras definidas pela organização no dia do evento.",
                    ].map((t, i) => (
                      <div key={i} className="flex gap-2.5 text-xs text-gray-600 leading-relaxed">
                        <span className="text-brand-yellow font-black flex-shrink-0">→</span>
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Rodapé de validação */}
              <div className="bg-gray-50 px-8 py-3 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 text-center">
                  Nº {reg.registrationNumber} · CPF: {formatCPF(reg.cpf)} · ID: {reg.paymentId} · Gerado em {new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </p>
              </div>

              {/* Footer */}
              <div className="bg-brand-black px-8 py-5 text-center">
                <p className="text-xs font-black text-brand-yellow">8º TRILHÃO DA SOLIDARIEDADE — 2026</p>
                <p className="text-[10px] text-white/40 mt-1">ASSOAPAC · Associação de Apoio ao Paciente com Câncer de Presidente Olegário · 100% da arrecadação revertida para esta causa.</p>
              </div>

              {/* Botões imprimir / baixar */}
              <div className="bg-white px-8 py-6 border-t border-gray-100 flex flex-wrap justify-center gap-3 print-hidden">
                <button
                  onClick={() => window.print()}
                  className="bg-brand-black text-brand-yellow font-black text-sm uppercase tracking-widest px-7 py-3 rounded-2xl hover:bg-gray-800 transition-all flex items-center gap-2"
                >
                  <span>Imprimir</span>
                </button>
                <a
                  href={`/api/payments/receipt/${id}`}
                  download
                  className="bg-brand-yellow text-brand-black font-black text-sm uppercase tracking-widest px-7 py-3 rounded-2xl hover:bg-yellow-300 transition-all flex items-center gap-2"
                >
                  <span>Baixar PDF</span>
                  <ChevronRight size={16} />
                </a>
              </div>
            </motion.div>
          ) : (
            <motion.div 
               key="pix"
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100"
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 bg-brand-yellow text-brand-black rounded-xl flex items-center justify-center shadow-sm">
                   <CreditCard size={20} />
                </div>
                <h2 className="text-2xl font-bold text-brand-black tracking-tight">Finalizar Pagamento</h2>
              </div>

              <div className="bg-brand-black rounded-2xl p-4 mb-8 text-center text-brand-yellow border border-brand-yellow/20">
                <div className="text-sm font-medium opacity-60 uppercase tracking-widest mb-1">A pagar</div>
                <div className="text-3xl font-black">{formatCurrency(reg.amount)}</div>
              </div>

              <div className="space-y-6">
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-white p-4 border-2 border-dashed border-gray-100 rounded-3xl group transition-all hover:border-brand-yellow">
                    <img 
                      src={`data:image/jpeg;base64,${reg.pixCode}`} 
                      alt="PIX QR Code" 
                      className="w-48 h-48"
                    />
                  </div>
                  <p className="text-sm text-gray-500 italic flex items-center gap-2">
                    <QrCode size={14} />
                    Abra o app do seu banco e escaneie
                  </p>
                </div>

                <div className="h-px bg-gray-100 w-full" />

                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">PIX Copia e Cola</label>
                  <div className="flex gap-2">
                    <input 
                      readOnly
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs font-mono text-gray-600 outline-none focus:border-brand-yellow"
                      value={reg.copyPaste}
                    />
                    <button 
                       onClick={copyToClipboard}
                       className="bg-brand-black text-brand-yellow p-3 rounded-xl transition-all active:scale-95 shadow-lg"
                    >
                      {copied ? <CheckCircle size={20} className="text-brand-yellow" /> : <Copy size={20} />}
                    </button>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3 text-amber-900 shadow-sm shadow-amber-900/5">
                   <Clock className="flex-shrink-0 mt-0.5" size={20} />
                   <p className="text-xs leading-relaxed">
                     O sistema reconhece o pagamento automaticamente. <strong>Não feche esta página</strong> ou verifique o status após o pagamento.
                   </p>
                </div>
                {timeLeft !== null && timeLeft > 0 && (
                  <div className="text-center text-sm text-gray-500">
                    PIX expira em: <span className="font-bold text-amber-600">
                      {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                    </span>
                  </div>
                )}
                {timeLeft !== null && timeLeft <= 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
                    <p className="text-red-700 font-bold text-sm">PIX expirado</p>
                    <p className="text-red-500 text-xs mt-1">Volte ao início e gere um novo PIX usando o mesmo CPF.</p>
                    <Link to="/" className="inline-block mt-3 text-xs font-bold text-brand-black underline">
                      Voltar ao início
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

const AdminDashboard = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);
  const [regs, setRegs] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, count: 0, balance: 0 });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedReg, setSelectedReg] = useState<any>(null);
  const [viewLogs, setViewLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "registrations" | "terms" | "vouchers" | "settings">("dashboard");
  const [mpConfig, setMpConfig] = useState({
    accessToken: "",
    publicKey: ""
  });
  const [shirtInventory, setShirtInventory] = useState<Record<string, number>>({ P: 0, M: 0, G: 0, GG: 0, XGG: 0, EX: 0 });
  const [savingInventory, setSavingInventory] = useState(false);
  const [allowMultipleCpf, setAllowMultipleCpf] = useState(false);
  const [savingEventConfig, setSavingEventConfig] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [cancellingReg, setCancellingReg] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [termsSearchTerm, setTermsSearchTerm] = useState("");
  const [voucherSearchTerm, setVoucherSearchTerm] = useState("");
  const [voucherFilterStatus, setVoucherFilterStatus] = useState<"all" | "used" | "pending">("all");
  const [selectedTermIds, setSelectedTermIds] = useState<Set<string>>(new Set());
  const [viewTermReg, setViewTermReg] = useState<any | null>(null);
  const [resendingTermEmail, setResendingTermEmail] = useState<string | null>(null);
  const [printQueue, setPrintQueue] = useState<any[] | null>(null);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [adminCheckinQr, setAdminCheckinQr] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    variant?: "danger";
    action: () => void;
  } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };


  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      setLoginLoading(false);
      setIsAdminUser(null);

      if (!u) {
        setAuthError("");
      }
    });

    return unsubAuth;
  }, []);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function checkAdminAccess() {
      setAuthError("");

      if (user.email === "bwk.bruno@gmail.com") {
        setIsAdminUser(true);
        return;
      }

      try {
        const adminSnap = await getDoc(doc(db, "admins", user.uid));

        if (cancelled) return;

        if (adminSnap.exists()) {
          setIsAdminUser(true);
        } else {
          setIsAdminUser(false);
          setAuthError(`Login realizado com ${user.email}, mas este usuário não está cadastrado como administrador.`);
        }
      } catch (error: any) {
        if (cancelled) return;

        console.error("Erro ao validar admin:", error);
        setIsAdminUser(false);
        setAuthError("Não foi possível validar seu acesso de administrador. Verifique as regras do Firestore e o documento admins/{uid}.");
      }
    }

    checkAdminAccess();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !isAdminUser) return;
    
    // Listen to registrations
    const q = query(collection(db, "registrations"), orderBy("createdAt", "desc"));
    const unsubRegs = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRegs(data);
      
      const confirmed = data.filter((r: any) => r.status === 'approved');
      setStats({
        total: data.length,
        count: confirmed.length,
        balance: confirmed.reduce((acc, curr: any) => acc + (Number(curr.amount) || 0), 0)
      });
    }, (error) => {
      console.error("Erro ao listar inscrições:", error);
      setAuthError("Login realizado, mas o Firestore bloqueou a leitura de inscrições. Confirme se este usuário é admin nas regras.");
    });

    // Listen to logs
    const lq = query(collection(db, "payment_logs"), orderBy("timestamp", "desc"), limit(50));
    const unsubLogs = onSnapshot(lq, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error("Erro ao listar logs:", error);
      setAuthError("Login realizado, mas o Firestore bloqueou a leitura dos logs de pagamento.");
    });

    const unsubInventory = onSnapshot(doc(db, "settings", "shirt_inventory"), (snap) => {
      if (snap.exists()) setShirtInventory(snap.data() as Record<string, number>);
    });

    const unsubEventConfig = onSnapshot(doc(db, "settings", "event_config"), (snap) => {
      if (snap.exists()) setAllowMultipleCpf(snap.data().allowMultipleCpf === true);
    });

    return () => {
      unsubRegs();
      unsubLogs();
      unsubInventory();
      unsubEventConfig();
    };
  }, [user, isAdminUser]);

  const handleToggleAllowMultipleCpf = async (value: boolean) => {
    setSavingEventConfig(true);
    try {
      await setDoc(doc(db, "settings", "event_config"), { allowMultipleCpf: value }, { merge: true });
      setAllowMultipleCpf(value);
    } catch {
      showToast("Erro ao salvar configuração.", "error");
    }
    setSavingEventConfig(false);
  };

  const handleSaveInventory = async () => {
    setSavingInventory(true);
    try {
      await setDoc(doc(db, "settings", "shirt_inventory"), shirtInventory);
      showToast("Estoque salvo com sucesso!", "success");
    } catch (e) {
      showToast("Erro ao salvar estoque.", "error");
    }
    setSavingInventory(false);
  };

  const handleManualConfirm = (id: string) => {
    setConfirmAction({
      title: "Confirmar pagamento manualmente?",
      message: "Use apenas se o webhook falhar e o pagamento já foi confirmado pelo Mercado Pago.",
      confirmLabel: "Confirmar",
      action: async () => {
        setConfirmAction(null);
        try {
          const { updateDoc, doc, serverTimestamp } = await import("firebase/firestore");
          await updateDoc(doc(db, "registrations", id), {
            status: "approved",
            confirmedAt: serverTimestamp(),
            manualConfirmation: true,
            adminEmail: user?.email
          });
          setSelectedReg(null);
          showToast("Inscrição confirmada com sucesso!", "success");
        } catch (e) {
          showToast("Erro ao atualizar status.", "error");
        }
      },
    });
  };

  const handleCancelRegistration = (reg: any) => {
    const isPaid = reg.status === "approved";
    setConfirmAction({
      title: isPaid ? "Cancelar e extornar pagamento?" : "Cancelar inscrição?",
      message: isPaid
        ? `O pagamento de ${formatCurrency(reg.amount)} será devolvido ao participante via Mercado Pago. Esta ação não pode ser desfeita.`
        : "A inscrição será cancelada e removida da lista de participantes. Esta ação não pode ser desfeita.",
      confirmLabel: isPaid ? "Extornar e Cancelar" : "Cancelar Inscrição",
      variant: "danger",
      action: async () => {
        setConfirmAction(null);
        setCancellingReg(reg.id);
        try {
          const token = await auth.currentUser?.getIdToken();
          const resp = await fetch(`/api/payments/cancel/${reg.id}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
          const data = await resp.json();
          if (!resp.ok) {
            const detail = data.details ? ` (${data.details})` : "";
            showToast((data.error || "Erro ao cancelar inscrição.") + detail, "error");
          } else if (data.action === "refunded") {
            showToast("Pagamento extornado e inscrição cancelada com sucesso!", "success");
            setSelectedReg(null);
          } else {
            showToast("Inscrição cancelada com sucesso!", "success");
            setSelectedReg(null);
          }
        } catch {
          showToast("Erro ao cancelar inscrição.", "error");
        } finally {
          setCancellingReg(null);
        }
      },
    });
  };

  const handleResendEmail = async (reg: any) => {
    setResendingEmail(reg.id);
    try {
      const token = await auth.currentUser?.getIdToken();
      const resp = await fetch(`/api/email/confirmation/${reg.id}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await resp.json();
      if (data.success) {
        showToast(`E-mail de confirmação reenviado para ${reg.email}`, "success");
      } else {
        showToast(data.error || "Erro ao reenviar e-mail.", "error");
      }
    } catch {
      showToast("Erro ao reenviar e-mail.", "error");
    } finally {
      setResendingEmail(null);
    }
  };

  const handleResendTermEmail = async (reg: any) => {
    setResendingTermEmail(reg.id);
    try {
      const token = await auth.currentUser?.getIdToken();
      const resp = await fetch(`/api/checkin/${reg.id}/send-term`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await resp.json();
      if (resp.ok) {
        showToast(`Termo reenviado para ${reg.email}`, "success");
      } else {
        showToast(data.error || "Erro ao reenviar termo.", "error");
      }
    } catch {
      showToast("Erro ao reenviar termo.", "error");
    } finally {
      setResendingTermEmail(null);
    }
  };

  const handleSyncPayment = async (paymentId: string) => {
    if (!paymentId) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const resp = await fetch(`/api/payments/verify/${paymentId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await resp.json();

      if (data.status === "approved") {
        showToast("Pagamento identificado como APROVADO no Mercado Pago! A inscrição foi atualizada.", "success");
        setSelectedReg(null);
      } else {
        showToast(`Status no Mercado Pago: ${data.status || "Pendente"}`, "info");
      }
    } catch (e) {
      showToast("Erro ao consultar Mercado Pago.", "error");
    }
  };

  const shareEventLink = () => {
    const url = window.location.origin;
    navigator.clipboard.writeText(url);
    showToast("Link do evento copiado para a área de transferência!", "success");
  };

  const generateParticipationTerm = (reg: any) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const html = `
      <html>
        <head>
          <title>Termo de Participação - ${reg.name}</title>
          <style>
            body { font-family: sans-serif; padding: 50px; line-height: 1.6; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #e11d48; padding-bottom: 20px; margin-bottom: 40px; }
            .content { max-width: 800px; margin: 0 auto; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 30px; text-align: center; }
            .info { margin-bottom: 20px; }
            .footer { margin-top: 60px; text-align: center; font-size: 12px; color: #666; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Trilho Beneficente</h1>
          </div>
          <div class="content">
            <div class="title">TERMO DE PARTICIPAÇÃO E RECIBO</div>
            ${reg.registrationNumber ? `<p><strong>Nº Inscrição: #${reg.registrationNumber}</strong></p>` : ''}
            <p>Confirmamos para os devidos fins que <strong>${reg.name}</strong>, inscrito sob o CPF <strong>${formatCPF(reg.cpf)}</strong>, realizou a inscrição para o evento beneficente com a contribuição no valor de <strong>${Number(reg.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>.</p>
            ${reg.guardianName ? `
            <div style="margin-top: 16px; padding: 12px 16px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px;">
              <p style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #92400e; text-transform: uppercase; letter-spacing: 0.05em;">Responsável Legal (Piloto Menor de Idade)</p>
              <p style="margin: 0;">Nome: <strong>${reg.guardianName}</strong></p>
              <p style="margin: 0;">CPF: <strong>${formatCPF(reg.guardianCpf)}</strong></p>
            </div>` : ''}
            <p>Status do Pagamento: <strong>${reg.status === 'approved' ? 'CONFIRMADO' : 'PENDENTE'}</strong></p>
            <p>Data da Inscrição: ${new Date(reg.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
            <div style="margin-top: 50px; border-top: 1px solid #ccc; width: 300px; margin-left: auto; margin-right: auto; padding-top: 10px; text-align: center;">
              Assinatura da Organização
            </div>
          </div>
          <div class="footer">
            Documento gerado eletronicamente em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}<br>
            ID da Transação: ${reg.paymentId}
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const getLoginErrorMessage = (error: any) => {
    const code = error?.code;

    if (code === "auth/unauthorized-domain") {
      return `Este domínio não está autorizado no Firebase Authentication. Adicione "${window.location.hostname}" em Authentication > Settings > Authorized domains.`;
    }

    if (code === "auth/operation-not-allowed") {
      return "O provedor Google ainda não está habilitado no Firebase Authentication.";
    }

    if (code === "auth/popup-closed-by-user") {
      return "A janela do Google foi fechada antes de concluir o login.";
    }

    if (code === "auth/popup-blocked") {
      return "O navegador bloqueou a janela de login. Libere pop-ups para este site e tente novamente.";
    }

    return "Não foi possível concluir o login com Google. Verifique o Firebase Authentication e tente novamente.";
  };

  const login = async () => {
    setLoginLoading(true);
    setAuthError("");

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Erro no login Google:", error);
      setAuthError(getLoginErrorMessage(error));
      setLoginLoading(false);
    }
  };

  const filteredRegs = regs.filter(r => {
    const matchesSearch =
      r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.cpf?.includes(searchTerm.replace(/\D/g, "")) ||
      r.registrationNumber?.includes(searchTerm.replace(/\D/g, ""));
    const matchesFilter = filterStatus === "all" || r.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  useEffect(() => {
    if (!selectedReg || selectedReg.status !== "approved") { setAdminCheckinQr(""); return; }
    const url = `${window.location.origin}/checkin/${selectedReg.id}`;
    QRCodeLib.toDataURL(url, { width: 300, margin: 2, color: { dark: "#111827", light: "#ffffff" } })
      .then(setAdminCheckinQr)
      .catch(() => setAdminCheckinQr(""));
  }, [selectedReg?.id, selectedReg?.status]);

  const signedRegs = regs.filter(r => r.termsSigned === true);
  const filteredSignedRegs = signedRegs.filter(r => {
    if (!termsSearchTerm) return true;
    const q = termsSearchTerm.toLowerCase();
    return (
      r.name?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.cpf?.includes(termsSearchTerm.replace(/\D/g, ""))
    );
  });

  const allVouchers = regs
    .filter(r => r.vouchers?.length)
    .flatMap(r => (r.vouchers as any[]).map(v => ({ v, reg: r })));
  const filteredVouchers = allVouchers.filter(({ v, reg }) => {
    const matchesStatus =
      voucherFilterStatus === "all" ||
      (voucherFilterStatus === "used" && v.used) ||
      (voucherFilterStatus === "pending" && !v.used);
    const q = voucherSearchTerm.toLowerCase();
    const matchesSearch =
      !q ||
      v.name?.toLowerCase().includes(q) ||
      reg.name?.toLowerCase().includes(q) ||
      v.code?.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const exportToExcel = () => {
    const now = new Date();
    const nowStr = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const fmtDate = (val: any): string => {
      if (!val) return "—";
      const d = val?.toDate ? val.toDate() : (val?.seconds ? new Date(val.seconds * 1000) : new Date(val));
      return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    };

    const fmtBRL = (val: any): string => {
      const n = Number(val);
      return isNaN(n) ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    };

    const paid      = regs.filter(r => r.status === "approved");
    const pending   = regs.filter(r => r.status === "pending");
    const cancelled = regs.filter(r => r.status === "cancelled");
    const refunded  = regs.filter(r => r.status === "refunded");

    const totalPaid     = paid.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalRefunded = refunded.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalPending  = pending.reduce((s, r) => s + Number(r.amount || 0), 0);

    // contagem de camisetas nas inscrições pagas
    const shirtOrder = ["P", "M", "G", "GG", "XG", "EG"];
    const shirtCount: Record<string, number> = {};
    paid.forEach(r => { const s = r.shirtSize || "Sem camiseta"; shirtCount[s] = (shirtCount[s] || 0) + 1; });
    const shirtRows = [
      ...shirtOrder.filter(s => shirtCount[s]).map(s => [s, shirtCount[s]]),
      ...Object.keys(shirtCount).filter(s => !shirtOrder.includes(s)).map(s => [s, shirtCount[s]]),
    ];

    // ── Aba 1: Resumo Financeiro ──────────────────────────────────
    const summaryAoa: any[][] = [
      ["8º TRILHÃO DA SOLIDARIEDADE — Prestação de Contas"],
      [`Emitido em: ${nowStr}`],
      [],
      ["RESUMO FINANCEIRO"],
      ["Situação", "Qtd.", "Valor Total"],
      ["Inscrições Pagas",                    paid.length,      fmtBRL(totalPaid)],
      ["Pendentes (aguardando pagamento)",     pending.length,   fmtBRL(totalPending)],
      ["Canceladas (sem pagamento efetivado)", cancelled.length, "—"],
      ["Extornadas (pagamento devolvido)",     refunded.length,  fmtBRL(totalRefunded)],
      ["TOTAL ARRECADADO (LÍQUIDO)",           paid.length,      fmtBRL(totalPaid - totalRefunded)],
      [],
      ["DISTRIBUIÇÃO DE CAMISETAS (inscrições pagas)"],
      ["Tamanho", "Quantidade"],
      ...shirtRows,
      [],
      ["CHECK-IN"],
      ["Realizaram check-in",  paid.filter(r => r.checkedIn).length],
      ["Sem check-in",         paid.filter(r => !r.checkedIn).length],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
    wsSummary["!cols"] = [{ wch: 44 }, { wch: 10 }, { wch: 20 }];
    wsSummary["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];

    // ── Aba 2: Inscrições Pagas ───────────────────────────────────
    const paidRows = paid
      .sort((a, b) => Number(a.registrationNumber || 0) - Number(b.registrationNumber || 0))
      .map(r => ({
        "Nº":                          r.registrationNumber ? `#${r.registrationNumber}` : "—",
        "Nome":                        r.name || "—",
        "CPF":                         formatCPF(r.cpf),
        "E-mail":                      r.email || "—",
        "WhatsApp":                    r.phone || "—",
        "Cidade":                      r.city || "—",
        "UF":                          r.state || "—",
        "Motocicleta":                 r.motorcycle || "—",
        "Camiseta":                    r.shirtSize || "—",
        "Valor (R$)":                  fmtBRL(r.amount),
        "Data da Inscrição":           fmtDate(r.createdAt),
        "Confirmação do Pagamento":    fmtDate(r.confirmedAt),
        "Check-in":                    r.checkedIn ? `Sim — ${fmtDate(r.checkedInAt)}` : "Não realizado",
        "ID Pagamento (MP)":           r.paymentId || "—",
        "ID Pedido (MP)":              r.orderId || "—",
      }));

    const wsPaid = XLSX.utils.json_to_sheet(paidRows.length ? paidRows : [{ "Informação": "Nenhuma inscrição paga." }]);
    wsPaid["!cols"] = [
      { wch: 8 }, { wch: 30 }, { wch: 16 }, { wch: 30 }, { wch: 16 },
      { wch: 22 }, { wch: 5 }, { wch: 30 }, { wch: 10 }, { wch: 14 },
      { wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 30 }, { wch: 30 },
    ];

    // ── Aba 3: Extornos e Cancelamentos ───────────────────────────
    const cancelRows = [...cancelled, ...refunded]
      .sort((a, b) => {
        const tsOf = (r: any) => {
          const v = r.refundedAt || r.cancelledAt;
          return v?.seconds ?? (v ? new Date(v).getTime() / 1000 : 0);
        };
        return tsOf(b) - tsOf(a);
      })
      .map(r => ({
        "Nº":                      r.registrationNumber ? `#${r.registrationNumber}` : "—",
        "Nome":                    r.name || "—",
        "CPF":                     formatCPF(r.cpf),
        "E-mail":                  r.email || "—",
        "Status":                  r.status === "refunded" ? "Extornado" : "Cancelado",
        "Motivo":                  r.status === "refunded"
                                     ? "Pagamento extornado via Mercado Pago"
                                     : "Inscrição cancelada sem pagamento confirmado",
        "Valor Pago (R$)":         r.status === "refunded" ? fmtBRL(r.amount) : "—",
        "Data da Inscrição":       fmtDate(r.createdAt),
        "Data do Cancelamento":    fmtDate(r.cancelledAt),
        "Data do Extorno":         fmtDate(r.refundedAt),
        "ID Pagamento (MP)":       r.paymentId || "—",
        "ID Extorno (MP)":         r.refundId || "—",
      }));

    const wsCancelled = XLSX.utils.json_to_sheet(cancelRows.length ? cancelRows : [{ "Informação": "Nenhum cancelamento ou extorno registrado." }]);
    wsCancelled["!cols"] = [
      { wch: 8 }, { wch: 30 }, { wch: 16 }, { wch: 30 }, { wch: 14 },
      { wch: 50 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 22 },
      { wch: 30 }, { wch: 30 },
    ];

    // ── Aba 4: Pendentes (apenas se existirem) ────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo Financeiro");
    XLSX.utils.book_append_sheet(wb, wsPaid,      `Pagas (${paid.length})`);
    XLSX.utils.book_append_sheet(wb, wsCancelled, "Extornos e Cancelamentos");

    if (pending.length > 0) {
      const pendingRows = pending
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
        .map(r => ({
          "Nº":                  r.registrationNumber ? `#${r.registrationNumber}` : "—",
          "Nome":                r.name || "—",
          "CPF":                 formatCPF(r.cpf),
          "E-mail":              r.email || "—",
          "WhatsApp":            r.phone || "—",
          "Cidade":              r.city || "—",
          "UF":                  r.state || "—",
          "Motocicleta":         r.motorcycle || "—",
          "Camiseta":            r.shirtSize || "—",
          "Valor (R$)":          fmtBRL(r.amount),
          "Data da Inscrição":   fmtDate(r.createdAt),
          "ID Pagamento (MP)":   r.paymentId || "—",
        }));
      const wsPending = XLSX.utils.json_to_sheet(pendingRows);
      wsPending["!cols"] = [
        { wch: 8 }, { wch: 30 }, { wch: 16 }, { wch: 30 }, { wch: 16 },
        { wch: 22 }, { wch: 5 }, { wch: 30 }, { wch: 10 }, { wch: 14 },
        { wch: 22 }, { wch: 30 },
      ];
      XLSX.utils.book_append_sheet(wb, wsPending, `Pendentes (${pending.length})`);
    }

    const dateStr = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(/\//g, "-");
    XLSX.writeFile(wb, `Trilhao-Prestacao-de-Contas-${dateStr}.xlsx`);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 text-center">
        <div className="bg-white p-12 rounded-3xl shadow-xl max-w-md w-full border border-gray-100">
          <LayoutDashboard size={48} className="mx-auto mb-6 text-brand-black" />
          <h2 className="text-2xl font-bold mb-2">Painel de Controle</h2>
          <p className="text-gray-500 lowercase">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 text-center">
        <div className="bg-white p-12 rounded-3xl shadow-xl max-w-md w-full border border-gray-100">
          <LayoutDashboard size={48} className="mx-auto mb-6 text-brand-black" />
          <h2 className="text-2xl font-bold mb-2">Painel de Controle</h2>
          <p className="text-gray-500 mb-8 lowercase">Acesso restrito para equipe de organização.</p>
          <button 
            onClick={login}
            disabled={loginLoading}
            className="w-full bg-brand-black text-brand-yellow font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-gray-800 transition-all shadow-lg"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" height="20" alt="" />
            {loginLoading ? "Entrando..." : "Entrar com Google"}
          </button>
          {authError && (
            <p className="mt-6 text-sm font-semibold leading-relaxed text-rose-600">
              {authError}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (isAdminUser !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 text-center">
        <div className="bg-white p-12 rounded-3xl shadow-xl max-w-md w-full border border-gray-100">
          <ShieldCheck size={48} className="mx-auto mb-6 text-brand-black" />
          <h2 className="text-2xl font-bold mb-2">Validando acesso</h2>
          <p className="text-gray-500 mb-6">{user.email}</p>
          {isAdminUser === null ? (
            <p className="text-sm text-gray-500">Conferindo permissões de administrador...</p>
          ) : (
            <>
              <p className="text-sm font-semibold leading-relaxed text-rose-600">
                {authError || "Este usuário não tem permissão para acessar o painel."}
              </p>
              <button
                onClick={() => auth.signOut()}
                className="mt-6 w-full bg-brand-black text-brand-yellow font-bold py-3 rounded-2xl hover:bg-gray-800 transition-all"
              >
                Sair e tentar outro Google
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar isAdmin={true} />
      
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Bottom nav — mobile only */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <nav className="bg-white rounded-2xl shadow-xl border border-gray-100/80 flex items-stretch p-1 gap-0.5">
            {([
              { tab: "dashboard" as const, icon: <LayoutDashboard size={19} />, label: "Dashboard" },
              { tab: "registrations" as const, icon: <Users size={19} />, label: "Inscrições" },
              { tab: "terms" as const, icon: <FileText size={19} />, label: "Termos", badge: signedRegs.length },
              { tab: "vouchers" as const, icon: <Ticket size={19} />, label: "Vouchers", badge: allVouchers.length > 0 ? allVouchers.length : undefined },
            ] as Array<{ tab: typeof activeTab; icon: React.ReactNode; label: string; badge?: number }>).map(({ tab, icon, label, badge }) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl transition-colors"
              >
                {activeTab === tab && (
                  <motion.div layoutId="mobile-nav-pill" className="absolute inset-0 bg-brand-black rounded-xl" transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                )}
                <span className={`relative z-10 transition-colors duration-150 ${activeTab === tab ? "text-brand-yellow" : "text-gray-400"}`}>{icon}</span>
                <span className={`relative z-10 text-[10px] font-black leading-none mt-0.5 transition-colors duration-150 ${activeTab === tab ? "text-brand-yellow" : "text-gray-400"}`}>{label}</span>
                {badge != null && badge > 0 && (
                  <span className="absolute top-1 right-2 min-w-[16px] h-4 bg-brand-yellow text-brand-black text-[9px] font-black rounded-full flex items-center justify-center px-1 z-20 shadow-sm">{badge > 99 ? "99+" : badge}</span>
                )}
              </button>
            ))}
            <button
              onClick={() => setShowMoreSheet(true)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl transition-colors"
            >
              <MoreHorizontal size={19} className="text-gray-400" />
              <span className="text-[10px] font-black leading-none mt-0.5 text-gray-400">Mais</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Navigation */}
        <aside className="hidden md:flex w-full md:w-64 bg-gray-900 text-white flex-shrink-0 flex-col h-auto md:h-[calc(100vh-64px)]">
        <div className="p-6 flex items-center gap-2 font-black text-brand-yellow border-b border-white/10 flex-shrink-0">
          <Heart size={24} className="fill-brand-yellow" />
          <span>PORTAL ADM</span>
        </div>
        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          <button 
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'dashboard' ? 'bg-brand-yellow text-brand-black shadow-md' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <LayoutDashboard size={20} />
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab("registrations")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'registrations' ? 'bg-brand-yellow text-brand-black shadow-md' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <Users size={20} />
            Inscrições
          </button>
          <button
            onClick={() => setActiveTab("terms")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'terms' ? 'bg-brand-yellow text-brand-black shadow-md' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <FileText size={20} />
            Termos
            {signedRegs.length > 0 && (
              <span className={`ml-auto text-xs font-black px-2 py-0.5 rounded-full ${activeTab === 'terms' ? 'bg-brand-black text-brand-yellow' : 'bg-white/10 text-white/60'}`}>
                {signedRegs.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("vouchers")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'vouchers' ? 'bg-brand-yellow text-brand-black shadow-md' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <Ticket size={20} />
            Vouchers
            {allVouchers.length > 0 && (
              <span className={`ml-auto text-xs font-black px-2 py-0.5 rounded-full ${activeTab === 'vouchers' ? 'bg-brand-black text-brand-yellow' : 'bg-white/10 text-white/60'}`}>
                {allVouchers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'settings' ? 'bg-brand-yellow text-brand-black shadow-md' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <ShieldCheck size={20} />
            Configurações
          </button>
          <div className="pt-4 pb-2 text-[10px] font-black text-white/30 uppercase tracking-widest px-4">Recursos</div>
          <button
            onClick={() => window.location.href = "/scanner"}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-gray-400 hover:bg-white/5 transition-all text-left"
          >
            <QrCode size={20} />
            Scanner Check-in
          </button>
          <button
            onClick={shareEventLink}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-gray-400 hover:bg-white/5 transition-all text-left"
          >
            <ExternalLink size={20} />
            Compartilhar Link
          </button>
          <button
            onClick={() => window.location.href = "/"}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-gray-400 hover:bg-white/5 transition-all text-left"
          >
            <Heart size={20} />
            Ver Landing Page
          </button>
        </nav>
        <div className="flex-shrink-0 p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-4 py-2 opacity-60">
            <div className="w-8 h-8 rounded-full bg-brand-yellow text-brand-black flex items-center justify-center font-bold text-xs">
              {user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="text-xs truncate">{user.email}</div>
          </div>
          <button 
            onClick={() => auth.signOut()}
            className="w-full mt-2 flex items-center gap-3 px-4 py-2 rounded-xl text-xs font-bold text-brand-yellow bg-white/5 hover:bg-brand-yellow/10 transition-all text-left"
          >
            Sair do Painel
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto h-screen p-4 md:p-8 pb-28 md:pb-8">
        <header className="mb-8">
          <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
            {activeTab === 'dashboard' ? 'Visão Geral' : activeTab === 'registrations' ? 'Gestão de Inscritos' : activeTab === 'terms' ? 'Termos Assinados' : activeTab === 'vouchers' ? 'Vouchers de Almoço' : 'Configurações'}
          </h1>
          <p className="text-sm text-gray-500">Gestão financeira e operacional do evento beneficente.</p>
        </header>

        {activeTab === 'dashboard' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {/* Header Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Arrecadação PIX</div>
                <div className="text-2xl font-black text-brand-black">{formatCurrency(stats.balance)}</div>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Inscrições Pagas</div>
                <div className="text-2xl font-black text-gray-900">{stats.count}</div>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total Iniciadas</div>
                <div className="text-2xl font-black text-gray-900">{stats.total}</div>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Conversão</div>
                <div className="text-2xl font-black text-gray-900">{stats.total > 0 ? Math.round((stats.count / stats.total) * 100) : 0}%</div>
              </div>
            </div>
            {/* Voucher Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:border-brand-yellow/40 transition-colors" onClick={() => setActiveTab("vouchers")}>
                <div className="w-10 h-10 rounded-2xl bg-brand-yellow/10 flex items-center justify-center flex-shrink-0">
                  <Ticket size={20} className="text-brand-black" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Vouchers Vendidos</div>
                  <div className="text-xl font-black text-gray-900">{allVouchers.length}</div>
                </div>
              </div>
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:border-emerald-200 transition-colors" onClick={() => { setActiveTab("vouchers"); setVoucherFilterStatus("used"); }}>
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <CheckCircle size={20} className="text-emerald-600" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Utilizados</div>
                  <div className="text-xl font-black text-emerald-600">{allVouchers.filter(({ v }) => v.used).length}</div>
                </div>
              </div>
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:border-amber-200 transition-colors" onClick={() => { setActiveTab("vouchers"); setVoucherFilterStatus("pending"); }}>
                <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <Clock size={20} className="text-amber-600" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pendentes</div>
                  <div className="text-xl font-black text-amber-600">{allVouchers.filter(({ v }) => !v.used).length}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <TrendingUp className="text-brand-black" size={20} />
                  Últimos Pagamentos
                </h3>
                <div className="space-y-4">
                  {regs.filter(r => r.status === 'approved').slice(0, 5).map(r => (
                    <div key={r.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl">
                      <div>
                        <div className="font-bold text-sm text-brand-black">{r.name}</div>
                        <div className="text-[10px] text-gray-400 uppercase font-bold">{new Date(r.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
                      </div>
                      <div className="text-brand-black font-black">+ {formatCurrency(r.amount)}</div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <ShieldCheck className="text-brand-black" size={20} />
                  Atividade do Webhook
                </h3>
                <div className="space-y-3">
                  {logs.slice(0, 5).map(log => (
                    <div key={log.id} className="text-xs p-3 border border-gray-50 rounded-xl font-mono flex justify-between">
                      <span className="opacity-60">{log.action || log.type}</span>
                      <span className="font-bold">{log.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'vouchers' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Buscar por nome do acompanhante, inscrito ou código..."
                  className="w-full bg-white border border-gray-200 rounded-2xl px-12 py-3 outline-none focus:ring-2 focus:ring-brand-yellow transition-all font-medium shadow-sm"
                  value={voucherSearchTerm}
                  onChange={e => setVoucherSearchTerm(e.target.value)}
                />
                <Ticket className="absolute left-4 top-3.5 text-gray-400" size={20} />
              </div>
              <select
                className="bg-white border border-gray-200 rounded-2xl px-6 py-3 outline-none focus:ring-2 focus:ring-brand-yellow font-bold text-gray-700 shadow-sm"
                value={voucherFilterStatus}
                onChange={e => setVoucherFilterStatus(e.target.value as any)}
              >
                <option value="all">Todos</option>
                <option value="used">Utilizados</option>
                <option value="pending">Pendentes</option>
              </select>
            </div>
            {filteredVouchers.length === 0 ? (
              <div className="bg-white rounded-3xl p-16 text-center shadow-sm border border-gray-100">
                <Ticket size={40} className="mx-auto mb-4 text-gray-300" />
                <p className="text-gray-400 font-bold">Nenhum voucher encontrado</p>
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Código</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Acompanhante</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-400 uppercase tracking-widest hidden md:table-cell">Inscrito</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-400 uppercase tracking-widest hidden md:table-cell">Utilizado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVouchers.map(({ v, reg }) => (
                      <tr key={`${reg.id}-${v.code}`} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-mono text-xs font-black bg-gray-100 px-2 py-1 rounded-lg">{v.code}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-sm text-gray-900">{v.name}</span>
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell">
                          <span className="text-sm text-gray-600">{reg.name}</span>
                          {reg.registrationNumber && (
                            <div className="text-xs text-gray-400">#{reg.registrationNumber}</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {v.used ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700">
                              <CheckCircle size={12} /> Utilizado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-700">
                              <Clock size={12} /> Pendente
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell text-sm text-gray-500">
                          {v.usedAt
                            ? new Date(v.usedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400 font-bold">
                  {filteredVouchers.length} voucher{filteredVouchers.length !== 1 ? "s" : ""}
                  {voucherFilterStatus !== "all" && ` · filtro: ${voucherFilterStatus === "used" ? "utilizados" : "pendentes"}`}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'registrations' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Filters & Search */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Buscar por nome, e-mail ou CPF..."
                  className="w-full bg-white border border-gray-200 rounded-2xl px-12 py-3 outline-none focus:ring-2 focus:ring-brand-yellow transition-all font-medium shadow-sm"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <Users className="absolute left-4 top-3.5 text-gray-400" size={20} />
              </div>
              <select 
                className="bg-white border border-gray-200 rounded-2xl px-6 py-3 outline-none focus:ring-2 focus:ring-brand-yellow font-bold text-gray-700 shadow-sm"
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
              >
                <option value="all">Todos Status</option>
                <option value="approved">Aprovados</option>
                <option value="pending">Pendentes</option>
                <option value="cancelled">Cancelados</option>
                <option value="refunded">Extornados</option>
              </select>
              <button 
                onClick={exportToExcel}
                className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-md"
              >
                <Copy size={18} />
                Exportar XLSX
              </button>
            </div>

            <div className="bg-white rounded-3xl shadow-sm overflow-hidden border border-gray-100">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-4 w-16">Nº</th>
                      <th className="px-6 py-4">Participante</th>
                      <th className="px-6 py-4">Data</th>
                      <th className="px-6 py-4">Valor</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-sm">
                    {filteredRegs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-gray-400">
                          <Users size={32} className="mx-auto mb-2 opacity-30" />
                          <p>{regs.length === 0 ? "Aguardando primeiras inscrições..." : "Nenhuma inscrição encontrada para esta busca."}</p>
                        </td>
                      </tr>
                    )}
                    {filteredRegs.map((r: any) => (
                      <tr key={r.id} className="hover:bg-gray-50/50 transition-all cursor-default text-brand-black">
                        <td className="px-4 py-5 font-black font-mono text-xs text-gray-500">
                          {r.registrationNumber ? `#${r.registrationNumber}` : "—"}
                        </td>
                        <td className="px-6 py-5">
                          <div className="font-bold">{r.name}</div>
                          <div className="text-xs text-gray-400">{r.email}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm font-medium text-gray-700">{new Date(r.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
                          <div className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td className="px-6 py-5 font-bold">{formatCurrency(r.amount)}</td>
                        <td className="px-6 py-5">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            r.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                            r.status === 'cancelled' ? 'bg-gray-100 text-gray-500' :
                            r.status === 'refunded' ? 'bg-red-100 text-red-600' :
                            'bg-brand-yellow/20 text-brand-black'
                          }`}>
                            {r.status === 'approved' ? 'Pago' : r.status === 'cancelled' ? 'Cancelado' : r.status === 'refunded' ? 'Extornado' : 'Pendente'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right flex justify-end gap-2">
                          {r.status === 'approved' && (
                            <button
                              onClick={() => handleResendEmail(r)}
                              title="Reenviar e-mail de confirmação"
                              disabled={resendingEmail === r.id}
                              className="p-2 hover:bg-blue-50 rounded-lg text-blue-400 hover:text-blue-600 transition-all disabled:opacity-40"
                            >
                              {resendingEmail === r.id ? <div className="w-[18px] h-[18px] border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> : <Mail size={18} />}
                            </button>
                          )}
                          {r.status === 'approved' && (
                            <button
                             onClick={() => generateParticipationTerm(r)}
                             title="Gerar Termo"
                             className="p-2 hover:bg-brand-yellow/10 rounded-lg text-brand-black transition-all"
                            >
                              <CreditCard size={18} />
                            </button>
                          )}
                          <button 
                            onClick={() => setSelectedReg(r)}
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-all"
                          >
                            <ExternalLink size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'terms' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-4 mb-6 items-start md:items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white border border-gray-100 rounded-2xl px-4 py-2.5 shadow-sm flex items-center gap-2">
                  <FileText size={16} className="text-gray-400" />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Assinados</span>
                  <span className="font-black text-gray-900 ml-1">{signedRegs.length}</span>
                </div>
                {selectedTermIds.size > 0 && (
                  <button
                    onClick={() => setPrintQueue(regs.filter(r => r.termsSigned && selectedTermIds.has(r.id)).sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR")))}
                    className="bg-brand-black text-brand-yellow font-bold px-4 py-2.5 rounded-2xl flex items-center gap-2 hover:bg-gray-800 transition-all shadow-md text-sm"
                  >
                    <Printer size={16} />
                    Imprimir ({selectedTermIds.size})
                  </button>
                )}
              </div>
              <div className="relative w-full md:w-72">
                <input
                  type="text"
                  placeholder="Buscar por nome ou e-mail..."
                  className="w-full bg-white border border-gray-200 rounded-2xl px-10 py-2.5 outline-none focus:ring-2 focus:ring-brand-yellow transition-all font-medium shadow-sm text-sm"
                  value={termsSearchTerm}
                  onChange={e => setTermsSearchTerm(e.target.value)}
                />
                <Users className="absolute left-3 top-2.5 text-gray-400" size={16} />
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm overflow-hidden border border-gray-100">
              {filteredSignedRegs.length > 0 && (
                <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 bg-gray-50/50">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-brand-black cursor-pointer"
                    checked={filteredSignedRegs.length > 0 && filteredSignedRegs.every(r => selectedTermIds.has(r.id))}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedTermIds(new Set(filteredSignedRegs.map(r => r.id)));
                      } else {
                        setSelectedTermIds(new Set());
                      }
                    }}
                  />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    {selectedTermIds.size > 0 ? `${selectedTermIds.size} selecionado(s)` : "Selecionar todos"}
                  </span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-4 w-10"></th>
                      <th className="px-4 py-4 w-16">Nº</th>
                      <th className="px-6 py-4">Participante</th>
                      <th className="px-6 py-4">Data da Assinatura</th>
                      <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-sm">
                    {filteredSignedRegs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-gray-400">
                          <FileText size={32} className="mx-auto mb-2 opacity-30" />
                          <p>{signedRegs.length === 0 ? "Nenhum termo assinado ainda." : "Nenhum resultado para esta busca."}</p>
                        </td>
                      </tr>
                    )}
                    {filteredSignedRegs.map((r: any) => (
                      <tr key={r.id} className="hover:bg-gray-50/50 transition-all cursor-default text-brand-black">
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded accent-brand-black cursor-pointer"
                            checked={selectedTermIds.has(r.id)}
                            onChange={e => {
                              setSelectedTermIds(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(r.id); else next.delete(r.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className="px-4 py-4 font-black font-mono text-xs text-gray-500">
                          {r.registrationNumber ? `#${r.registrationNumber}` : "—"}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold">{r.name}</div>
                          <div className="text-xs text-gray-400">{r.email}</div>
                        </td>
                        <td className="px-6 py-4">
                          {r.termsSignedAt ? (
                            <>
                              <div className="text-sm font-medium text-gray-700">
                                {(r.termsSignedAt?.toDate ? r.termsSignedAt.toDate() : new Date(r.termsSignedAt)).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                              </div>
                              <div className="text-xs text-gray-400">
                                {(r.termsSignedAt?.toDate ? r.termsSignedAt.toDate() : new Date(r.termsSignedAt)).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => handleResendTermEmail(r)}
                              title="Reenviar termo por e-mail"
                              disabled={resendingTermEmail === r.id}
                              className="p-2 hover:bg-blue-50 rounded-lg text-blue-400 hover:text-blue-600 transition-all disabled:opacity-40"
                            >
                              {resendingTermEmail === r.id
                                ? <div className="w-[18px] h-[18px] border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                : <Mail size={18} />}
                            </button>
                            <button
                              onClick={() => setPrintQueue([r])}
                              title="Imprimir termo"
                              className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-all"
                            >
                              <Printer size={18} />
                            </button>
                            <button
                              onClick={() => setViewTermReg(r)}
                              title="Visualizar termo"
                              className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-all"
                            >
                              <ExternalLink size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* Regras de Inscrição */}
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-2xl mx-auto">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-brand-black rounded-2xl flex items-center justify-center">
                  <Users size={22} className="text-brand-yellow" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Regras de Inscrição</h3>
                  <p className="text-sm text-gray-500">Controle o comportamento do formulário público.</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                <div>
                  <p className="font-bold text-gray-800 text-sm">Permitir múltiplas inscrições por CPF</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {allowMultipleCpf
                      ? "Ativado — o mesmo CPF pode se inscrever mais de uma vez."
                      : "Desativado — cada CPF só pode ter uma inscrição."}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleAllowMultipleCpf(!allowMultipleCpf)}
                  disabled={savingEventConfig}
                  className={`relative w-14 h-7 rounded-full transition-all duration-300 focus:outline-none disabled:opacity-50 ${allowMultipleCpf ? "bg-brand-black" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-all duration-300 ${allowMultipleCpf ? "translate-x-7" : "translate-x-0"}`} />
                </button>
              </div>
            </div>

            {/* Gestão de Camisetas */}
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-2xl mx-auto">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-brand-black rounded-2xl flex items-center justify-center">
                  <Shirt size={22} className="text-brand-yellow" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Estoque de Camisetas</h3>
                  <p className="text-sm text-gray-500">Quantidade disponível por tamanho. Aparece em tempo real na inscrição.</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {SHIRT_SIZES.map((size) => (
                  <div key={size} className="bg-gray-50 rounded-2xl p-3">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 text-center">{size}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShirtInventory(prev => ({ ...prev, [size]: Math.max(0, (prev[size] ?? 0) - 1) }))}
                        className="w-8 h-8 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-all font-bold text-gray-600"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        min={0}
                        className="flex-1 text-center font-black text-lg outline-none bg-transparent w-0"
                        value={shirtInventory[size] ?? 0}
                        onChange={e => setShirtInventory(prev => ({ ...prev, [size]: Math.max(0, Number(e.target.value)) }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShirtInventory(prev => ({ ...prev, [size]: (prev[size] ?? 0) + 1 }))}
                        className="w-8 h-8 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-all font-bold text-gray-600"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    {(shirtInventory[size] ?? 0) > 0 && (shirtInventory[size] ?? 0) < LOW_STOCK_THRESHOLD && (
                      <p className="text-[10px] text-amber-500 font-black text-center mt-1 flex items-center justify-center gap-0.5">
                        <AlertTriangle size={9} />Esgotando
                      </p>
                    )}
                    {(shirtInventory[size] ?? 0) === 0 && (
                      <p className="text-[10px] text-red-400 font-black text-center mt-1">Esgotado</p>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={handleSaveInventory}
                disabled={savingInventory}
                className="w-full bg-brand-black text-brand-yellow font-bold py-3 rounded-2xl hover:bg-gray-800 transition-all disabled:opacity-50"
              >
                {savingInventory ? "Salvando..." : "Salvar Estoque"}
              </button>
            </div>

            {/* Integração Mercado Pago */}
            <div className="max-w-2xl mx-auto">
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-2xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-brand-black">
                     <CreditCard size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Integração Mercado Pago</h3>
                    <p className="text-sm text-gray-500">Configurações de gateway de pagamento.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-xs text-amber-800 flex gap-3">
                    <ShieldCheck size={20} className="flex-shrink-0" />
                    <p>Essas configurações são aplicadas no servidor via variáveis de ambiente. Certifique-se de que o <strong>APP_URL</strong> está configurado corretamente para que o webhook funcione.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Access Token</label>
                    <input
                      type="password"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono outline-none"
                      defaultValue="Carregado via environment secrets"
                      readOnly
                    />
                    <p className="mt-1 text-[10px] text-gray-400">Gerenciado via variável de ambiente MERCADO_PAGO_ACCESS_TOKEN no servidor.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Public Key</label>
                    <input
                      type="text"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono outline-none"
                      defaultValue={import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY || "Não configurada"}
                      readOnly
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>

      {/* Terms print overlay — portal para body para que page-break funcione em print */}
      {printQueue && createPortal(
        <div className="fixed inset-0 z-[9999] bg-white overflow-y-auto" id="terms-print-overlay">
          <div className="print-hidden sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 shadow-sm">
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-brand-black" />
              <span className="font-black text-gray-900">
                {printQueue.length === 1 ? "Visualizar Termo" : `${printQueue.length} Termos para Impressão`}
              </span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="bg-brand-black text-brand-yellow font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-gray-800 transition-all text-sm"
              >
                <Printer size={16} />
                Imprimir
              </button>
              <button
                onClick={() => setPrintQueue(null)}
                className="bg-gray-100 text-gray-600 font-bold px-5 py-2.5 rounded-xl hover:bg-gray-200 transition-all text-sm"
              >
                Fechar
              </button>
            </div>
          </div>
          <div id="terms-print-content" className="max-w-3xl mx-auto px-6 py-8">
            {printQueue.map((reg, i) => (
              <div
                key={reg.id}
                className={`term-print-wrapper${i < printQueue.length - 1 ? " terms-page-break pb-8 mb-8 border-b-2 border-dashed border-gray-300" : ""}`}
              >
                <TermDocument reg={reg} signature={reg.termsSignature} />
                <div className="term-digital-footer mt-4 pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-500 text-center">
                    Assinado digitalmente em:{" "}
                    <strong>
                      {reg.termsSignedAt?.toDate
                        ? reg.termsSignedAt.toDate().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
                        : reg.termsSignedAt ? new Date(reg.termsSignedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}
                    </strong>
                  </p>
                  <p className="text-xs text-gray-400 text-center mt-1">
                    Documento armazenado com segurança — ID: {reg.id}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* View Term Modal */}
      <AnimatePresence>
        {viewTermReg && (
          <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewTermReg(null)}
              className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl my-8"
            >
              <div className="sticky top-0 bg-white rounded-t-[2.5rem] px-8 pt-8 pb-4 border-b border-gray-100 flex flex-wrap gap-2 justify-between items-center z-10">
                <h3 className="text-xl font-black text-gray-900">Termo de Responsabilidade</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPrintQueue([viewTermReg]); setViewTermReg(null); }}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-black text-brand-yellow font-bold rounded-xl hover:bg-gray-800 transition-all text-sm"
                  >
                    <Printer size={15} />
                    Imprimir
                  </button>
                  <button
                    onClick={() => handleResendTermEmail(viewTermReg)}
                    disabled={resendingTermEmail === viewTermReg.id}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition-all text-sm disabled:opacity-40"
                  >
                    {resendingTermEmail === viewTermReg.id
                      ? <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      : <Mail size={15} />}
                    Reenviar
                  </button>
                  <button
                    onClick={() => setViewTermReg(null)}
                    className="p-2 hover:bg-gray-100 rounded-xl transition-all"
                    aria-label="Fechar"
                  >
                    <X size={20} className="text-gray-400" />
                  </button>
                </div>
              </div>
              <div className="px-8 pb-8 pt-4">
                <TermDocument reg={viewTermReg} signature={viewTermReg.termsSignature} />
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-500 text-center">
                    Assinado digitalmente em:{" "}
                    <strong>
                      {viewTermReg.termsSignedAt?.toDate
                        ? viewTermReg.termsSignedAt.toDate().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
                        : viewTermReg.termsSignedAt ? new Date(viewTermReg.termsSignedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}
                    </strong>
                  </p>
                  <p className="text-xs text-gray-400 text-center mt-1">
                    Documento armazenado com segurança — ID: {viewTermReg.id}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedReg && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedReg(null)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-2xl font-black text-gray-900 leading-tight">Detalhes do Inscrito</h3>
                    <p className="text-gray-400 text-sm font-mono">{selectedReg.id}</p>
                  </div>
                  <button onClick={() => setSelectedReg(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-all" aria-label="Fechar">
                    <X size={20} className="text-gray-400" />
                  </button>
                </div>

                <div className="space-y-4 mb-8">
                  {selectedReg.registrationNumber && (
                    <div className="bg-brand-yellow/10 border border-brand-yellow/30 p-4 rounded-3xl flex items-center gap-3">
                      <Hash size={18} className="text-brand-black" />
                      <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nº Inscrição</div>
                        <div className="font-black text-brand-black font-mono text-lg">#{selectedReg.registrationNumber}</div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-3xl">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Nome</div>
                      <div className="font-bold text-gray-800 text-sm truncate">{selectedReg.name}</div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-3xl">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">CPF</div>
                      <div className="font-bold text-gray-800 text-sm">{formatCPF(selectedReg.cpf)}</div>
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-3xl">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Payment ID</div>
                    <div className="font-mono text-xs text-gray-600 break-all">{selectedReg.paymentId}</div>
                  </div>
                  {selectedReg.orderId && (
                    <div className="bg-gray-50 p-4 rounded-3xl">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Order ID (Mercado Pago)</div>
                      <div className="font-mono text-xs text-gray-600 break-all select-all">{selectedReg.orderId}</div>
                    </div>
                  )}
                  <div className="bg-gray-50 p-4 rounded-3xl">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Status Sistema</div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className={`w-3 h-3 rounded-full ${
                        selectedReg.status === 'approved' ? 'bg-green-500' :
                        selectedReg.status === 'cancelled' ? 'bg-gray-400' :
                        selectedReg.status === 'refunded' ? 'bg-red-500' :
                        'bg-amber-500'
                      }`} />
                      <span className="font-black text-sm uppercase">
                        {selectedReg.status === 'approved' ? 'Confirmado' :
                         selectedReg.status === 'cancelled' ? 'Cancelado' :
                         selectedReg.status === 'refunded' ? 'Extornado' :
                         'Aguardando'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {/* QR Code de check-in */}
                  {selectedReg.status === 'approved' && (
                    <div className="bg-gray-50 rounded-2xl p-4 text-center">
                      <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">QR Code de Check-in</p>
                      {adminCheckinQr ? (
                        <img
                          src={adminCheckinQr}
                          alt="QR Code de Check-in"
                          className="w-40 h-40 mx-auto rounded-xl border-2 border-brand-yellow"
                        />
                      ) : (
                        <div className="w-40 h-40 mx-auto rounded-xl border-2 border-brand-yellow flex items-center justify-center bg-white">
                          <Loader2 size={24} className="animate-spin text-gray-300" />
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        {selectedReg.checkedIn ? (
                          <span className="text-green-600 font-bold">✓ Check-in realizado</span>
                        ) : "Check-in ainda não realizado"}
                        {selectedReg.termsSigned && <span className="text-green-600 font-bold block">✓ Termo assinado</span>}
                      </p>
                      <a
                        href={`/checkin/${selectedReg.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-black underline"
                      >
                        <ExternalLink size={12} />
                        Abrir página de check-in
                      </a>
                    </div>
                  )}
                  <button
                    onClick={() => generateParticipationTerm(selectedReg)}
                    className="w-full bg-brand-black text-brand-yellow font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-all shadow-md"
                  >
                    <Copy size={18} />
                    Gerar Recibo / Termo
                  </button>
                  {selectedReg.status !== 'approved' && selectedReg.status !== 'cancelled' && selectedReg.status !== 'refunded' && (
                    <button
                      onClick={() => handleManualConfirm(selectedReg.id)}
                      className="w-full bg-brand-black text-brand-yellow font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-all shadow-lg border border-brand-yellow/20"
                    >
                      <CheckCircle size={18} />
                      Confirmar Manualmente
                    </button>
                  )}
                  {selectedReg.status !== 'cancelled' && selectedReg.status !== 'refunded' && (
                    <button
                      onClick={() => handleCancelRegistration(selectedReg)}
                      disabled={cancellingReg === selectedReg.id}
                      className="w-full bg-red-50 text-red-600 border border-red-200 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-red-100 transition-all disabled:opacity-50"
                    >
                      <XCircle size={18} />
                      {cancellingReg === selectedReg.id
                        ? "Processando..."
                        : selectedReg.status === 'approved'
                        ? "Cancelar e Extornar Pagamento"
                        : "Cancelar Inscrição"}
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedReg(null)}
                    className="w-full bg-gray-100 text-gray-600 font-bold py-4 rounded-2xl hover:bg-gray-200 transition-all"
                  >
                    Fechar Detalhes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-xl text-white font-medium text-sm flex items-center gap-3 ${
          toast.type === "success" ? "bg-green-600" :
          toast.type === "error" ? "bg-red-600" : "bg-gray-800"
        }`}>
          {toast.type === "success" && <CheckCircle size={18} />}
          {toast.type === "error" && <AlertTriangle size={18} />}
          {toast.message}
        </div>
      )}

      {/* Confirm action modal */}
      <AnimatePresence>
        {confirmAction && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmAction(null)}
              className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center"
            >
              <AlertTriangle size={40} className={`mx-auto mb-4 ${confirmAction.variant === 'danger' ? 'text-red-500' : 'text-amber-500'}`} />
              <h3 className="text-lg font-black text-gray-900 mb-2">{confirmAction.title}</h3>
              <p className="text-sm text-gray-500 mb-6">{confirmAction.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-2xl hover:bg-gray-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => confirmAction.action()}
                  className={`flex-1 font-bold py-3 rounded-2xl transition-all ${
                    confirmAction.variant === 'danger'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-brand-black text-brand-yellow hover:bg-gray-800'
                  }`}
                >
                  {confirmAction.confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Slide-up sheet "Mais" — mobile only */}
      <AnimatePresence>
        {showMoreSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowMoreSheet(false)}
              className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="md:hidden fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 px-4 pt-3 space-y-2"
              style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl mb-3">
                <div className="w-9 h-9 rounded-full bg-brand-yellow text-brand-black flex items-center justify-center font-black text-sm flex-shrink-0">
                  {user?.email?.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-bold text-gray-700 truncate">{user?.email}</span>
              </div>
              {([
                { icon: <QrCode size={20} />, label: "Scanner Check-in", onClick: () => { window.location.href = "/scanner"; setShowMoreSheet(false); } },
                { icon: <ExternalLink size={20} />, label: "Compartilhar Link", onClick: () => { shareEventLink(); setShowMoreSheet(false); } },
                { icon: <Heart size={20} />, label: "Ver Landing Page", onClick: () => { window.location.href = "/"; } },
              ] as Array<{ icon: React.ReactNode; label: string; onClick: () => void }>).map(({ icon, label, onClick }) => (
                <button key={label} onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gray-50 active:bg-gray-100 transition-all text-left">
                  <span className="text-gray-700">{icon}</span>
                  <span className="font-bold text-gray-700">{label}</span>
                </button>
              ))}
              <button
                onClick={() => auth.signOut()}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-red-50 active:bg-red-100 transition-all text-left mt-1"
              >
                <LogOut size={20} className="text-red-500" />
                <span className="font-bold text-red-600">Sair do Painel</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Check-in Page ---

function TermDocument({ reg, signature }: { reg: any; signature?: string }) {
  const fmtCPF = (cpf: string | undefined) => {
    const d = (cpf || "").replace(/\D/g, "");
    if (d.length !== 11) return cpf || "—";
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  };
  const fmtDateTime = (val: any) => {
    if (!val) return "—";
    const d = val?.toDate ? val.toDate() : new Date(val);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  };
  const isMinor = !!(reg?.guardianName?.trim());
  const addr = [reg?.street, reg?.number, reg?.neighborhood, reg?.city && reg?.state ? `${reg.city}/${reg.state}` : (reg?.city || ""), reg?.cep ? `CEP ${reg.cep}` : ""].filter(Boolean).join(", ");
  let sec = 1;
  const H = ({ children }: { children: React.ReactNode }) => {
    const n = sec++;
    return <h3 className="font-black text-gray-900 text-sm uppercase tracking-wide mt-5 mb-2 border-b border-gray-200 pb-1">{n}. {children}</h3>;
  };
  const P = ({ children }: { children: React.ReactNode }) => (
    <p className="text-xs text-gray-700 leading-relaxed mb-3 text-justify">{children}</p>
  );
  const DataTable = ({ rows }: { rows: [string, string][] }) => (
    <table className="w-full border border-gray-200 rounded-lg overflow-hidden mb-4 text-xs">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-gray-100 last:border-0">
            <td className="font-bold text-gray-600 py-2 px-3 w-2/5 bg-gray-50 align-top">{label}</td>
            <td className="text-gray-800 py-2 px-3">{value || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="font-sans term-doc-content">
      <div className="text-center mb-5 pb-4 border-b-2 border-gray-900">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Termo de Responsabilidade, Ciência de Riscos e Autorização de Uso de Imagem</p>
        <h2 className="font-black text-base text-gray-900 uppercase leading-tight">8º Trilhão da Solidariedade</h2>
        <p className="text-xs text-gray-500 mt-1">Presidente Olegário — MG · 2026 · 100% revertido à ASSOAPAC</p>
      </div>

      <H>Identificação do participante</H>
      <DataTable rows={[
        ["Nome completo", reg?.name || "—"],
        ["Data de nascimento", reg?.birthDate || "—"],
        ["CPF", fmtCPF(reg?.cpf)],
        ["E-mail", reg?.email || "—"],
        ["WhatsApp/telefone", reg?.phone || "—"],
        ["Contato de emergência", reg?.emergencyName || "—"],
        ["Telefone do contato", reg?.emergencyPhone || "—"],
        ["Endereço", addr || "—"],
        ["Motocicleta", reg?.motorcycle || "—"],
        ["Tamanho da camiseta", reg?.shirtSize || "—"],
        ["Número de inscrição", reg?.registrationNumber ? `#${reg.registrationNumber}` : "—"],
      ]} />

      {isMinor && (
        <>
          <H>Responsável legal</H>
          <P>Esta seção aplica-se ao participante menor de 18 anos.</P>
          <DataTable rows={[
            ["Nome completo do responsável", reg?.guardianName || "—"],
            ["CPF do responsável", fmtCPF(reg?.guardianCpf)],
          ]} />
        </>
      )}

      <H>Declaração de participação voluntária</H>
      <P>Eu, <strong>{reg?.name || "—"}</strong>, inscrito(a) no CPF nº <strong>{fmtCPF(reg?.cpf)}</strong>, declaro que estou me inscrevendo e participando do evento 8º TRILHÃO DA SOLIDARIEDADE por livre e espontânea vontade, sem qualquer coação, imposição ou obrigação, assumindo os riscos ordinários, previsíveis e inerentes à modalidade.</P>

      <H>Ciência dos riscos da atividade</H>
      <P>Declaro estar ciente de que atividades de trilha, motociclismo off road, passeio, deslocamento em grupo e participação em evento em área rural ou urbana podem envolver riscos, incluindo, mas não se limitando a: quedas, tombos, escorregões, colisões, abalroamentos e perda de controle da motocicleta; terrenos irregulares, trechos com pedras, lama, poeira, areia, buracos, aclives, declives, erosões, valas, raízes, galhos e obstáculos naturais ou artificiais; variações climáticas, chuva, baixa visibilidade, calor, frio e demais condições ambientais; problemas mecânicos, pane elétrica, falha de freios, pneus, suspensão, direção ou demais componentes da motocicleta; contato com animais, insetos, vegetação, cercas, porteiras, propriedades rurais e vias de circulação; lesões leves, moderadas ou graves, danos materiais, perda de bens pessoais, necessidade de atendimento médico, remoção ou resgate.</P>

      <H>Condições físicas, técnicas e de saúde</H>
      <P>Declaro que possuo condições físicas, mentais e técnicas compatíveis com a participação no evento, bem como conhecimento básico necessário para condução da motocicleta na modalidade proposta. Declaro, ainda, que não possuo restrição médica conhecida que me impeça de participar, responsabilizando-me por avaliar minhas próprias condições antes e durante o evento.</P>

      <H>Equipamentos de segurança e conduta</H>
      <P>Comprometo-me a utilizar capacete e demais equipamentos de proteção adequados à modalidade, manter minha motocicleta em condições seguras de uso, respeitar as orientações da organização, conduzir com prudência, respeitar os demais participantes, preservar áreas privadas, públicas e ambientais, e não praticar manobras ou condutas que coloquem em risco a mim, outros participantes, espectadores, terceiros ou a própria organização.</P>

      <H>Responsabilidade pela motocicleta e por bens pessoais</H>
      <P>Declaro ser responsável pela motocicleta informada no cadastro, descrita como <strong>{reg?.motorcycle || "—"}</strong>, bem como por seus documentos, condições de funcionamento, transporte, guarda, equipamentos, acessórios e bens pessoais. Estou ciente de que a organização não se responsabiliza por danos, perdas, furtos, extravios, defeitos, panes ou despesas relacionadas à motocicleta, equipamentos ou pertences pessoais, salvo hipóteses de responsabilidade legal que não possam ser afastadas.</P>

      <H>Atendimento de emergência</H>
      <P>Em caso de acidente, mal-estar ou situação de emergência, autorizo a organização a acionar o contato de emergência informado, <strong>{reg?.emergencyName || "—"}</strong>, pelo telefone <strong>{reg?.emergencyPhone || "—"}</strong>, bem como a solicitar atendimento de primeiros socorros, transporte, resgate ou encaminhamento médico, quando necessário. Estou ciente de que eventuais despesas médicas, hospitalares, medicamentosas, de transporte, guincho, reparo ou resgate não assumidas expressamente pela organização serão de minha responsabilidade.</P>

      <H>Autorização de uso de imagem, voz e nome</H>
      <P>Autorizo, de forma gratuita, a captação, edição, reprodução, publicação e divulgação de minha imagem, voz, nome e registros audiovisuais realizados durante o evento, para fins institucionais, promocionais, informativos, históricos e de divulgação do 8º TRILHÃO DA SOLIDARIEDADE, da ASSOAPAC, do MXPO Trilheiros, apoiadores, patrocinadores e imprensa. A autorização abrange meios físicos e digitais, incluindo redes sociais, sites, aplicativos, materiais impressos, vídeos, fotografias, transmissões, reportagens e peças de comunicação relacionadas ao evento, sem que isso gere qualquer remuneração, indenização ou ônus à organização.</P>

      <H>Tratamento de dados pessoais</H>
      <P>Declaro estar ciente de que os dados pessoais informados na inscrição serão tratados pela organização e pela aplicação com a finalidade de realizar inscrição, controle de participantes, emissão de comprovante, confirmação de pagamento, comunicação sobre o evento, segurança operacional, prestação de contas, atendimento a obrigações legais e gestão administrativa do evento.</P>

      <H>Registro de aceite digital pela aplicação</H>
      <DataTable rows={[
        ["Aceite dos termos", "Sim — registrado ao assinar este documento"],
        ["Data e hora do cadastro", fmtDateTime(reg?.createdAt)],
        ["Status da inscrição", reg?.status === "approved" ? "Aprovada" : reg?.status || "—"],
        ["Valor pago", `R$ ${Number(reg?.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`],
        ["ID externo do pagamento", reg?.paymentId || "—"],
        ["Data e hora da confirmação do pagamento", fmtDateTime(reg?.confirmedAt)],
      ]} />

      <H>Declaração final</H>
      <P>Após ler este termo, declaro que compreendi seu conteúdo, estou ciente dos riscos, responsabilidades, condições de participação e autorizações aqui previstas, concordando integralmente com suas disposições. Declaro também que as informações fornecidas no cadastro são verdadeiras, completas e atualizadas, assumindo responsabilidade por eventuais erros, omissões ou informações incorretas.</P>

      <div className="term-signature-section mt-6 pt-4 border-t border-gray-300">
        <p className="text-xs text-gray-600 mb-4"><strong>Local e data:</strong> {reg?.city && reg?.state ? `${reg.city}/${reg.state}` : "Presidente Olegário/MG"}, {fmtDateTime(reg?.createdAt)}</p>
        <div className={`grid gap-8 ${isMinor ? "grid-cols-2" : "grid-cols-1 max-w-xs"}`}>
          <div>
            {signature
              ? <img src={signature} alt="Assinatura" className="w-full mb-1 rounded" style={{ height: 56, objectFit: "contain", objectPosition: "bottom left", borderBottom: "2px solid #9CA3AF" }} />
              : <div className="border-b-2 border-gray-400 mb-2" style={{ height: 56 }} />
            }
            <p className="text-xs text-center text-gray-500">Assinatura do participante</p>
            <p className="text-xs text-center font-bold text-gray-800 mt-0.5">{reg?.name || "—"}</p>
          </div>
          {isMinor && (
            <div>
              <div className="border-b-2 border-gray-400 mb-2" style={{ height: 56 }} />
              <p className="text-xs text-center text-gray-500">Assinatura do responsável legal</p>
              <p className="text-xs text-center font-bold text-gray-800 mt-0.5">{reg?.guardianName || "—"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignaturePad({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const [hasStrokes, setHasStrokes] = React.useState(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    drawing.current = true;
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasStrokes(true);
  };

  const end = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={180}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        className="w-full border-2 border-dashed border-gray-300 rounded-2xl bg-white touch-none cursor-crosshair"
        style={{ height: 160 }}
      />
      <div className="flex gap-3 mt-3">
        <button type="button" onClick={clear}
          className="px-4 py-2 text-sm font-bold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
          Limpar
        </button>
        <button
          type="button"
          disabled={!hasStrokes}
          onClick={() => onSave(canvasRef.current!.toDataURL("image/png"))}
          className="flex-1 py-2 text-sm font-black bg-brand-black text-brand-yellow rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-all"
        >
          Confirmar Assinatura
        </button>
      </div>
    </div>
  );
}

const CheckInPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [reg, setReg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);
  const [done, setDone] = useState(false);
  const [adminUser, setAdminUser] = useState<FirebaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setAdminUser(u);
      if (!u) { setIsAdmin(false); setAuthLoading(false); return; }
      if (u.email === "bwk.bruno@gmail.com") { setIsAdmin(true); setAuthLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, "admins", u.uid));
        setIsAdmin(snap.exists());
      } catch { setIsAdmin(false); }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, "registrations", id), (snap) => {
      if (!snap.exists()) { setError("Inscrição não encontrada."); setLoading(false); return; }
      setReg({ id: snap.id, ...snap.data() });
      setLoading(false);
    }, () => { setError("Erro ao carregar inscrição."); setLoading(false); });
  }, [id]);

  const handleLogin = async () => {
    setLoginLoading(true);
    try { await signInWithPopup(auth, googleProvider); }
    catch { setLoginLoading(false); }
  };

  const handleCheckIn = async () => {
    setCheckingIn(true);
    try {
      const resp = await fetch(`/api/checkin/${id}`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok && resp.status !== 409) {
        alert(data.error || "Erro ao realizar check-in.");
      } else {
        setDone(true);
      }
    } catch { alert("Erro ao realizar check-in. Tente novamente."); }
    setCheckingIn(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="animate-spin text-gray-400" size={32} />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <XCircle size={48} className="text-red-400 mx-auto mb-4" />
        <p className="text-gray-700 font-bold">{error}</p>
      </div>
    </div>
  );

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="animate-spin text-gray-400" size={32} />
    </div>
  );

  if (!isAdmin) return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-brand-black py-8 px-4 text-center">
        <p className="text-xs font-black text-brand-yellow/60 uppercase tracking-widest mb-1">8ª Edição · 2026</p>
        <h1 className="text-2xl font-black text-brand-yellow">Trilhão da Solidariedade</h1>
        <p className="text-sm text-white/50 mt-1">Check-in · Credenciamento</p>
      </div>
      <div className="max-w-sm mx-auto px-4 py-12 text-center space-y-6">
        <div className="w-16 h-16 bg-brand-black rounded-2xl flex items-center justify-center mx-auto">
          <ShieldCheck size={28} className="text-brand-yellow" />
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900 mb-2">Acesso Restrito</h2>
          <p className="text-sm text-gray-500">Esta área é exclusiva para organizadores do evento. Faça login com a conta da organização para continuar.</p>
        </div>
        <button
          onClick={handleLogin}
          disabled={loginLoading}
          className="w-full bg-brand-black text-brand-yellow font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-all disabled:opacity-50"
        >
          {loginLoading ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
          {loginLoading ? "Entrando..." : "Entrar com Google"}
        </button>
      </div>
    </div>
  );

  const alreadyCheckedIn = reg?.checkedIn;
  const isApproved = reg?.status === "approved";
  const termsSigned = reg?.termsSigned;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-brand-black py-8 px-4 text-center">
        <p className="text-xs font-black text-brand-yellow/60 uppercase tracking-widest mb-1">8ª Edição · 2026</p>
        <h1 className="text-2xl font-black text-brand-yellow">Trilhão da Solidariedade</h1>
        <p className="text-sm text-white/50 mt-1">Check-in · Credenciamento</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
        {/* Status badge */}
        {!isApproved && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
            <p className="text-sm font-bold text-amber-700">Esta inscrição não está confirmada. Verifique o status do pagamento.</p>
          </div>
        )}

        {/* Card do participante */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-brand-black px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-white/40 font-bold uppercase tracking-widest">Inscrição</p>
              <p className="text-2xl font-black text-brand-yellow">#{reg?.registrationNumber}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
              reg?.status === "approved" ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"
            }`}>
              {reg?.status === "approved" ? "Confirmado" : "Pendente"}
            </span>
          </div>

          <div className="divide-y divide-gray-50">
            <div className="px-6 py-4">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-0.5">Piloto</p>
              <p className="text-lg font-black text-gray-900">{reg?.name}</p>
              <p className="text-sm text-gray-500">{reg?.city} / {reg?.state}</p>
            </div>
            <div className="px-6 py-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-0.5">Moto</p>
                <p className="text-sm font-bold text-gray-800">{reg?.motorcycle}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-0.5">Camiseta</p>
                <p className="text-sm font-bold text-gray-800">{reg?.shirtSize}</p>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-0.5">Contato de Emergência</p>
              <p className="text-sm font-bold text-gray-800">{reg?.emergencyName} · {reg?.emergencyPhone}</p>
            </div>
          </div>
        </div>

        {/* Status do check-in */}
        {(alreadyCheckedIn || done) && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
            <p className="text-sm font-bold text-green-700">Check-in realizado com sucesso!</p>
          </div>
        )}

        {/* Ações */}
        {isApproved && (
          <div className="space-y-3">
            {!alreadyCheckedIn && !done && (
              <button
                onClick={handleCheckIn}
                disabled={checkingIn}
                className="w-full bg-brand-black text-brand-yellow font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-all disabled:opacity-50 text-base"
              >
                {checkingIn ? <Loader2 size={20} className="animate-spin" /> : <UserCheck size={20} />}
                {checkingIn ? "Realizando check-in..." : "Realizar Check-in"}
              </button>
            )}

            {(alreadyCheckedIn || done) && !termsSigned && (
              <button
                onClick={() => navigate(`/checkin/${id}/termos`)}
                className="w-full bg-brand-yellow text-brand-black font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-yellow-400 transition-all text-base"
              >
                <ChevronRight size={20} />
                Assinar Termo de Responsabilidade
              </button>
            )}

            {termsSigned && (
              <div className="bg-brand-black rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle size={20} className="text-brand-yellow flex-shrink-0" />
                <p className="text-sm font-bold text-white">Termo de responsabilidade já assinado.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const TermsPage = () => {
  const { id } = useParams<{ id: string }>();
  const [reg, setReg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signed, setSigned] = useState(false);
  const [step, setStep] = useState<"terms" | "sign" | "done">("terms");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handlePrint = () => {
    document.body.classList.add("terms-page-printing");
    window.onafterprint = () => document.body.classList.remove("terms-page-printing");
    window.print();
  };

  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, "registrations", id), (snap) => {
      if (!snap.exists()) { setLoading(false); return; }
      const data = { id: snap.id, ...snap.data() };
      setReg(data);
      if ((data as any).termsSigned) setSigned(true);
      setLoading(false);
    });
  }, [id]);

  const handleSign = async (signature: string) => {
    setSaving(true);
    try {
      const resp = await fetch(`/api/checkin/${id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, signerName: reg?.name }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert(data.error || "Erro ao salvar assinatura."); }
      else { setStep("done"); setSigned(true); }
    } catch { alert("Erro ao salvar assinatura. Tente novamente."); }
    setSaving(false);
  };

  const handleSendTermEmail = async () => {
    setSendingEmail(true);
    try {
      const resp = await fetch(`/api/checkin/${id}/send-term`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) alert(data.error || "Erro ao enviar e-mail.");
      else setEmailSent(true);
    } catch { alert("Erro ao enviar e-mail. Tente novamente."); }
    setSendingEmail(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="animate-spin text-gray-400" size={32} />
    </div>
  );

  if (step === "done" || signed) {
    const signedAt = reg?.termsSignedAt?.toDate ? reg.termsSignedAt.toDate().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        {/* Header — oculto na impressão */}
        <div className="bg-brand-black py-6 px-4 text-center print-hidden">
          <h1 className="text-xl font-black text-brand-yellow">Trilhão da Solidariedade</h1>
          <p className="text-xs text-white/50 mt-1">Termo de Responsabilidade</p>
        </div>

        {/* Badge sucesso — oculto na impressão */}
        <div className="print-hidden max-w-2xl mx-auto px-4 pt-6 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
            <CheckCircle size={20} className="text-green-600" />
          </div>
          <div>
            <p className="font-black text-gray-900">Termo assinado com sucesso!</p>
            <p className="text-sm text-gray-500">Inscrição #{reg?.registrationNumber} · {signedAt}</p>
          </div>
        </div>

        {/* Documento com assinatura — visível na tela E na impressão */}
        <div className="max-w-2xl mx-auto px-4 pb-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm" id="term-document">
            <TermDocument reg={reg} signature={reg?.termsSignature} />
            <div className="mt-4 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">Assinado digitalmente em: <strong>{signedAt}</strong></p>
              <p className="text-xs text-gray-400 text-center mt-1">Documento armazenado com segurança — ID: {id}</p>
            </div>
          </div>
        </div>

        {/* Botões de ação — ocultos na impressão */}
        <div className="print-hidden max-w-2xl mx-auto px-4 space-y-3">
          <button
            onClick={handlePrint}
            className="w-full bg-brand-black text-brand-yellow font-black py-4 rounded-2xl hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
          >
            Imprimir Termo
          </button>
          {!emailSent ? (
            <div className="w-full bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-green-700">E-mail enviado automaticamente para {reg?.email}</p>
              <button
                onClick={handleSendTermEmail}
                disabled={sendingEmail}
                className="text-xs font-black text-green-700 underline whitespace-nowrap disabled:opacity-50 flex items-center gap-1"
              >
                {sendingEmail ? <Loader2 size={14} className="animate-spin" /> : null}
                Reenviar
              </button>
            </div>
          ) : (
            <div className="w-full bg-green-50 border border-green-200 text-green-700 font-bold py-4 rounded-2xl text-center text-sm">
              ✓ Termo reenviado para {reg?.email}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-brand-black py-8 px-4 text-center">
        <h1 className="text-2xl font-black text-brand-yellow">Trilhão da Solidariedade</h1>
        <p className="text-sm text-white/50 mt-1">Termo de Responsabilidade</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Info do participante */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-brand-black rounded-xl flex items-center justify-center flex-shrink-0">
            <User size={20} className="text-brand-yellow" />
          </div>
          <div>
            <p className="font-black text-gray-900">{reg?.name}</p>
            <p className="text-sm text-gray-500">Inscrição #{reg?.registrationNumber} · {reg?.motorcycle}</p>
          </div>
        </div>

        {step === "terms" && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="bg-brand-black px-5 py-3">
                <p className="text-xs font-black text-brand-yellow uppercase tracking-widest">Leia com atenção antes de assinar</p>
              </div>
              <div className="px-5 py-5 max-h-[70vh] overflow-y-auto">
                <TermDocument reg={reg} />
              </div>
            </div>
            <button
              onClick={() => setStep("sign")}
              className="w-full bg-brand-black text-brand-yellow font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-all text-base"
            >
              Li e Concordo — Prosseguir para Assinatura
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {step === "sign" && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <div>
                <p className="text-sm font-black text-gray-700 mb-1">Assine no campo abaixo</p>
                <p className="text-xs text-gray-400">Use o dedo ou a caneta do dispositivo. A assinatura será salva digitalmente.</p>
              </div>
              <SignaturePad onSave={handleSign} />
              {saving && (
                <div className="flex items-center justify-center gap-2 py-2">
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                  <p className="text-sm text-gray-500">Salvando assinatura...</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setStep("terms")}
              className="w-full text-sm font-bold text-gray-500 py-2"
            >
              ← Voltar e reler o termo
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// --- Voucher Validation Page ---

const VoucherValidationPage = () => {
  const { docId, code } = useParams();
  const [reg, setReg] = useState<any>(null);
  const [voucher, setVoucher] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [using, setUsing] = useState(false);
  const [useError, setUseError] = useState("");

  useEffect(() => {
    if (!docId || !code) return;
    const unsub = onSnapshot(doc(db, "registrations", docId), (snap) => {
      if (!snap.exists()) { setNotFound(true); setLoading(false); return; }
      const data = snap.data();
      const v = (data.vouchers || []).find((vv: any) => vv.code === code);
      if (!v) { setNotFound(true); setLoading(false); return; }
      setReg(data);
      setVoucher(v);
      setLoading(false);
    }, () => { setNotFound(true); setLoading(false); });
    return unsub;
  }, [docId, code]);

  const handleUse = async () => {
    if (!docId || !code || using) return;
    setUsing(true);
    setUseError("");
    try {
      const resp = await fetch(`/api/voucher/${docId}/${code}/use`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) setUseError(data.error || "Erro ao usar voucher.");
    } catch {
      setUseError("Erro ao conectar ao servidor.");
    }
    setUsing(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 size={44} className="animate-spin text-brand-black" />
    </div>
  );
  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
      <div className="text-center">
        <AlertTriangle size={48} className="mx-auto mb-4 text-amber-500" />
        <p className="text-gray-700 font-bold">Voucher não encontrado.</p>
      </div>
    </div>
  );

  // Voucher já utilizado — tela de alerta prominente
  if (voucher.used) {
    const usedAtStr = voucher.usedAt
      ? new Date(voucher.usedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : "—";
    return (
      <div className="min-h-screen bg-red-600 flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden"
        >
          <div className="bg-red-600 px-8 py-8 text-center">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle size={48} className="text-white" />
            </div>
            <p className="text-3xl font-black text-white leading-tight">VOUCHER JÁ<br />UTILIZADO</p>
            <p className="text-sm text-white/70 mt-2 font-medium">Este voucher não pode ser usado novamente</p>
          </div>
          <div className="px-8 py-6 space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-3">
              <div>
                <p className="text-[10px] font-black text-red-400 uppercase tracking-wider mb-0.5">Utilizado em</p>
                <p className="text-base font-black text-red-700">{usedAtStr}</p>
              </div>
              <div className="h-px bg-red-100" />
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Acompanhante</p>
                <p className="text-base font-black text-gray-800">{voucher.name}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Titular</p>
                <p className="text-sm font-bold text-gray-600">{reg.name}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Código</p>
                <p className="text-sm font-mono font-bold text-gray-500">{voucher.code}</p>
              </div>
            </div>
            <p className="text-center text-xs text-gray-400 leading-relaxed">
              Caso haja algum problema, entre em contato com a organização do evento.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Voucher válido — tela de confirmação
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl border border-gray-200 max-w-sm w-full overflow-hidden"
      >
        <div className="bg-brand-black px-8 py-6 text-center">
          <p className="text-[10px] font-black text-brand-yellow/60 tracking-widest mb-1">VOUCHER DE ALMOÇO</p>
          <p className="text-xl font-black text-brand-yellow">8º Trilhão da Solidariedade</p>
          <div className="mt-3 inline-flex items-center gap-1.5 bg-green-600 text-white text-xs font-black px-4 py-1.5 rounded-full">
            <CheckCircle size={12} />
            VÁLIDO — NÃO UTILIZADO
          </div>
        </div>
        <div className="px-8 py-6 space-y-4">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Acompanhante</p>
            <p className="text-xl font-black text-brand-black">{voucher.name}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Titular</p>
            <p className="text-sm font-bold text-gray-700">{reg.name}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Código</p>
            <p className="text-sm font-mono font-bold text-gray-700">{voucher.code}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800 leading-relaxed">
            Este voucher garante 1 (uma) refeição completa no evento para o acompanhante identificado acima.
          </div>
          {useError && <p className="text-red-500 text-xs font-medium">{useError}</p>}
          <button
            onClick={handleUse}
            disabled={using}
            className="w-full bg-brand-black text-brand-yellow font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-all disabled:opacity-50 text-base"
          >
            {using && <Loader2 size={18} className="animate-spin" />}
            Marcar como Utilizado
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// --- Main App ---

// --- Scanner Page ---

const ScannerPage = () => {
  const navigate = useNavigate();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const animRef = React.useRef<number>(0);
  const streamRef = React.useRef<MediaStream | null>(null);
  const processingRef = React.useRef(false);

  const [status, setStatus] = React.useState<"idle" | "requesting" | "scanning" | "found" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState("");
  const [manualInput, setManualInput] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");
  const [torch, setTorch] = React.useState(false);
  const [torchSupported, setTorchSupported] = React.useState(false);

  const stopCamera = React.useCallback(() => {
    cancelAnimationFrame(animRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleQRResult = React.useCallback((data: string) => {
    if (processingRef.current) return;
    const checkinMatch = data.match(/\/checkin\/([a-zA-Z0-9]+)/);
    const voucherMatch = data.match(/\/validar-voucher\/([a-zA-Z0-9]+)\/([A-Z0-9-]+)/);
    if (checkinMatch || voucherMatch) {
      processingRef.current = true;
      setStatus("found");
      stopCamera();
      if (checkinMatch) {
        setTimeout(() => navigate(`/checkin/${checkinMatch[1]}`), 700);
      } else if (voucherMatch) {
        setTimeout(() => navigate(`/validar-voucher/${voucherMatch[1]}/${voucherMatch[2]}`), 700);
      }
    }
  }, [navigate, stopCamera]);

  const scanFrame = React.useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || processingRef.current) return;

    if (video.readyState >= 2 && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (code?.data) {
          handleQRResult(code.data);
          return;
        }
      }
    }
    animRef.current = requestAnimationFrame(scanFrame);
  }, [handleQRResult]);

  const startCamera = React.useCallback(async () => {
    setStatus("requesting");
    setErrorMsg("");
    processingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      const capabilities = (track as any).getCapabilities?.() as any;
      if (capabilities?.torch) setTorchSupported(true);

      const video = videoRef.current;
      if (!video) { stopCamera(); return; }
      video.srcObject = stream;
      await video.play();
      setStatus("scanning");
      animRef.current = requestAnimationFrame(scanFrame);
    } catch (err: any) {
      setStatus("error");
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setErrorMsg("Permissão de câmera negada. Libere o acesso nas configurações do navegador e tente novamente.");
      } else if (err.name === "NotFoundError") {
        setErrorMsg("Nenhuma câmera encontrada neste dispositivo.");
      } else {
        setErrorMsg("Não foi possível acessar a câmera. Verifique as permissões e tente novamente.");
      }
    }
  }, [scanFrame, stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const newVal = !torch;
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: newVal }] });
      setTorch(newVal);
    } catch { /* silently ignore */ }
  };

  // ── Relatório de check-in ──
  const [view, setView] = React.useState<"scanner" | "report">("scanner");
  const [reportRegs, setReportRegs] = React.useState<any[]>([]);
  const [reportLoading, setReportLoading] = React.useState(false);
  const [reportFilter, setReportFilter] = React.useState<"all" | "done" | "pending">("all");
  const [reportSearch, setReportSearch] = React.useState("");
  const reportUnsubRef = React.useRef<(() => void) | null>(null);

  const loadReport = React.useCallback(() => {
    if (reportUnsubRef.current) return;
    setReportLoading(true);
    const q = query(
      collection(db, "registrations"),
      where("status", "==", "approved"),
      orderBy("registrationNumber")
    );
    reportUnsubRef.current = onSnapshot(q, snap => {
      setReportRegs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setReportLoading(false);
    }, () => setReportLoading(false));
  }, []);

  const switchView = React.useCallback((v: "scanner" | "report") => {
    if (v === "report") { stopCamera(); loadReport(); }
    else { startCamera(); }
    setView(v);
  }, [stopCamera, startCamera, loadReport]);

  React.useEffect(() => {
    startCamera();
    return () => { stopCamera(); reportUnsubRef.current?.(); };
  }, [startCamera, stopCamera]);

  const filteredReport = React.useMemo(() => {
    let list = reportRegs;
    if (reportFilter === "done") list = list.filter(r => r.checkedIn);
    if (reportFilter === "pending") list = list.filter(r => !r.checkedIn);
    if (reportSearch) {
      const q = reportSearch.toLowerCase();
      list = list.filter(r =>
        r.name?.toLowerCase().includes(q) ||
        String(r.registrationNumber || "").includes(q)
      );
    }
    return list;
  }, [reportRegs, reportFilter, reportSearch]);

  const checkedInCount = reportRegs.filter(r => r.checkedIn).length;
  const pendingCount = reportRegs.length - checkedInCount;

  const handlePrintReport = () => {
    const checkedList = reportRegs.filter(r => r.checkedIn);
    const pendingList = reportRegs.filter(r => !r.checkedIn);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
      <title>Relatório de Check-in — 8º Trilhão da Solidariedade</title>
      <style>
        body{font-family:sans-serif;padding:32px;color:#111;font-size:12px}
        h1{font-size:18px;margin:0 0 4px}p.sub{color:#6b7280;margin:0 0 20px;font-size:11px}
        .stats{display:flex;gap:16px;margin-bottom:20px}
        .stat{border:1px solid #e5e7eb;border-radius:8px;padding:10px 18px;text-align:center}
        .stat-n{font-size:22px;font-weight:900}.stat-l{font-size:10px;color:#9ca3af;text-transform:uppercase}
        h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin:20px 0 8px;border-bottom:2px solid #111;padding-bottom:4px}
        table{width:100%;border-collapse:collapse}
        th{text-align:left;padding:5px 8px;border-bottom:2px solid #111;font-size:10px;color:#6b7280;text-transform:uppercase}
        td{padding:5px 8px;border-bottom:1px solid #f3f4f6;vertical-align:top}
        tr:nth-child(even) td{background:#f9fafb}
        .ok{color:#16a34a;font-weight:700}.warn{color:#d97706;font-weight:700}
        @media print{@page{size:A4;margin:15mm}}
      </style></head><body>
      <h1>Relatório de Check-in</h1>
      <p class="sub">8º Trilhão da Solidariedade · Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
      <div class="stats">
        <div class="stat"><div class="stat-n">${reportRegs.length}</div><div class="stat-l">Total</div></div>
        <div class="stat"><div class="stat-n" style="color:#16a34a">${checkedList.length}</div><div class="stat-l">Check-in ✓</div></div>
        <div class="stat"><div class="stat-n" style="color:#d97706">${pendingList.length}</div><div class="stat-l">Aguardando</div></div>
      </div>
      <h2>✓ Check-in Realizado (${checkedList.length})</h2>
      <table><thead><tr><th>#</th><th>Nome</th><th>Camiseta</th><th>Moto</th><th>Termo</th></tr></thead><tbody>
        ${checkedList.map(r => `<tr><td class="ok">#${r.registrationNumber||"—"}</td><td>${r.name||"—"}</td><td>${r.shirtSize||"—"}</td><td>${r.motorcycle||"—"}</td><td>${r.termsSigned ? "✓ Assinado" : "⚠ Pendente"}</td></tr>`).join("")}
      </tbody></table>
      <h2>⌛ Aguardando Check-in (${pendingList.length})</h2>
      <table><thead><tr><th>#</th><th>Nome</th><th>Camiseta</th><th>Moto</th><th>Cidade</th></tr></thead><tbody>
        ${pendingList.map(r => `<tr><td class="warn">#${r.registrationNumber||"—"}</td><td>${r.name||"—"}</td><td>${r.shirtSize||"—"}</td><td>${r.motorcycle||"—"}</td><td>${r.city ? `${r.city}/${r.state||""}` : "—"}</td></tr>`).join("")}
      </tbody></table>
      <script>window.print();</script></body></html>`);
    win.document.close();
  };

  const handleManualSearch = async () => {
    const q = manualInput.trim().replace(/^#/, "");
    if (!q) return;
    setSearching(true);
    setSearchError("");
    try {
      if (q.length > 10) {
        const snap = await getDoc(doc(db, "registrations", q));
        if (snap.exists()) { navigate(`/checkin/${q}`); return; }
      }
      const qry = query(collection(db, "registrations"), where("registrationNumber", "==", q), limit(1));
      const result = await getDocs(qry);
      if (!result.empty) { navigate(`/checkin/${result.docs[0].id}`); return; }
      setSearchError("Inscrição não encontrada. Verifique o número e tente novamente.");
    } catch {
      setSearchError("Erro ao buscar inscrição. Tente novamente.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-black flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-brand-black px-4 py-4 flex items-center justify-between flex-shrink-0 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-yellow rounded-xl flex items-center justify-center">
            {view === "scanner" ? <QrCode size={18} className="text-brand-black" /> : <Users size={18} className="text-brand-black" />}
          </div>
          <div>
            <h1 className="text-base font-black text-brand-yellow leading-tight">
              {view === "scanner" ? "Scanner de Check-in" : "Relatório de Check-in"}
            </h1>
            <p className="text-[10px] text-white/40 uppercase tracking-widest">8º Trilhão da Solidariedade</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-white/10 rounded-xl p-0.5">
            <button
              onClick={() => switchView("scanner")}
              className={`p-1.5 rounded-lg transition-all ${view === "scanner" ? "bg-brand-yellow text-brand-black" : "text-white/40 hover:text-white/70"}`}
              title="Scanner"
            >
              <QrCode size={18} />
            </button>
            <button
              onClick={() => switchView("report")}
              className={`p-1.5 rounded-lg transition-all ${view === "report" ? "bg-brand-yellow text-brand-black" : "text-white/40 hover:text-white/70"}`}
              title="Relatório"
            >
              <Users size={18} />
            </button>
          </div>
          {torchSupported && view === "scanner" && status === "scanning" && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded-xl transition-all ${torch ? "bg-brand-yellow text-brand-black" : "text-white/40 hover:text-white/80"}`}
              title={torch ? "Apagar lanterna" : "Ligar lanterna"}
            >
              <Zap size={20} />
            </button>
          )}
          <button onClick={() => navigate("/admin")} className="p-2 rounded-xl text-white/40 hover:text-white/80 transition-all">
            <X size={22} />
          </button>
        </div>
      </div>

      {/* ── SCANNER VIEW ── */}
      {view === "scanner" && (
        <>
          <div className="relative flex-1 bg-black flex items-center justify-center" style={{ minHeight: 0 }}>
            <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />

            {status === "scanning" && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-black/50" style={{
                  WebkitMaskImage: "radial-gradient(ellipse 280px 280px at 50% 50%, transparent 30%, black 70%)",
                  maskImage: "radial-gradient(ellipse 280px 280px at 50% 50%, transparent 30%, black 70%)",
                }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative w-64 h-64">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-brand-yellow rounded-tl-md" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-brand-yellow rounded-tr-md" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-brand-yellow rounded-bl-md" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-brand-yellow rounded-br-md" />
                    <div className="animate-scan-line bg-brand-yellow/70" />
                  </div>
                </div>
                <div className="absolute bottom-6 left-0 right-0 text-center">
                  <p className="text-white/70 text-sm font-medium">Aponte para o QR Code do participante</p>
                </div>
              </div>
            )}
            {status === "found" && (
              <div className="absolute inset-0 bg-green-500/30 flex flex-col items-center justify-center gap-4">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-2xl">
                  <CheckCircle size={44} className="text-white" />
                </motion.div>
                <p className="text-white font-black text-lg">QR Code reconhecido!</p>
                <p className="text-white/50 text-xs">Redirecionando...</p>
              </div>
            )}
            {status === "requesting" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <Loader2 size={44} className="text-brand-yellow animate-spin" />
                <p className="text-white/60 text-sm">Aguardando acesso à câmera...</p>
              </div>
            )}
            {status === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                  <AlertTriangle size={32} className="text-red-400" />
                </div>
                <div>
                  <p className="text-white font-bold mb-1">Câmera indisponível</p>
                  <p className="text-white/50 text-sm leading-relaxed">{errorMsg}</p>
                </div>
                <button onClick={startCamera} className="bg-brand-yellow text-brand-black font-black px-6 py-3 rounded-2xl hover:bg-yellow-400 transition-all">
                  Tentar novamente
                </button>
              </div>
            )}
          </div>

          <div className="bg-gray-900 px-4 py-5 flex-shrink-0 border-t border-white/10">
            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3">Busca manual por número de inscrição</p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={manualInput}
                onChange={e => { setManualInput(e.target.value); setSearchError(""); }}
                onKeyDown={e => e.key === "Enter" && handleManualSearch()}
                placeholder="Ex: 42"
                className="flex-1 bg-white/10 text-white placeholder-white/20 border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-yellow/60 transition-all font-medium"
              />
              <button
                onClick={handleManualSearch}
                disabled={searching || !manualInput.trim()}
                className="bg-brand-yellow text-brand-black font-black px-5 py-3 rounded-2xl hover:bg-yellow-400 transition-all disabled:opacity-40 flex items-center gap-2 min-w-[52px] justify-center"
              >
                {searching ? <Loader2 size={18} className="animate-spin" /> : <ChevronRight size={18} />}
              </button>
            </div>
            {searchError && (
              <p className="text-red-400 text-xs mt-2 font-medium flex items-center gap-1">
                <AlertTriangle size={12} />{searchError}
              </p>
            )}
          </div>
        </>
      )}

      {/* ── REPORT VIEW ── */}
      {view === "report" && (
        <div className="flex-1 bg-gray-50 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-px bg-gray-200 flex-shrink-0">
            <div className="bg-white px-4 py-3 text-center">
              <div className="text-xl font-black text-gray-900">{reportRegs.length}</div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total</div>
            </div>
            <div className="bg-white px-4 py-3 text-center">
              <div className="text-xl font-black text-green-600">{checkedInCount}</div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Check-in ✓</div>
            </div>
            <div className="bg-white px-4 py-3 text-center">
              <div className="text-xl font-black text-amber-500">{pendingCount}</div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Aguardando</div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={reportSearch}
                  onChange={e => setReportSearch(e.target.value)}
                  placeholder="Buscar por nome ou número..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-9 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-yellow/50"
                />
                <Users className="absolute left-3 top-2.5 text-gray-400" size={14} />
              </div>
              <button
                onClick={handlePrintReport}
                className="bg-brand-black text-brand-yellow font-bold px-4 py-2 rounded-xl flex items-center gap-2 text-sm hover:bg-gray-800 transition-all flex-shrink-0"
                title="Imprimir relatório"
              >
                <Printer size={16} />
                <span className="hidden sm:inline">Imprimir</span>
              </button>
            </div>
            <div className="flex gap-2">
              {([
                { v: "all", label: `Todos (${reportRegs.length})` },
                { v: "done", label: `✓ Feito (${checkedInCount})` },
                { v: "pending", label: `⌛ Falta (${pendingCount})` },
              ] as const).map(({ v, label }) => (
                <button
                  key={v}
                  onClick={() => setReportFilter(v)}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${reportFilter === v ? "bg-brand-black text-brand-yellow" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {reportLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={32} className="animate-spin text-gray-300" />
              </div>
            ) : filteredReport.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Users size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">{reportRegs.length === 0 ? "Nenhum inscrito aprovado." : "Nenhum resultado."}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredReport.map(r => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 cursor-pointer"
                    onClick={() => navigate(`/checkin/${r.id}`)}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${r.checkedIn ? "bg-green-100" : "bg-amber-50"}`}>
                      {r.checkedIn
                        ? <CheckCircle size={16} className="text-green-600" />
                        : <Clock size={16} className="text-amber-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 text-sm truncate">{r.name}</div>
                      <div className="text-xs text-gray-400 flex gap-2">
                        <span>#{r.registrationNumber || "—"}</span>
                        {r.shirtSize && <span>· {r.shirtSize}</span>}
                        {r.checkedIn && r.termsSigned && <span className="text-green-600">· Termo ✓</span>}
                        {r.checkedIn && !r.termsSigned && <span className="text-amber-500">· Termo pendente</span>}
                      </div>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-1 rounded-full flex-shrink-0 ${r.checkedIn ? "bg-green-100 text-green-700" : "bg-amber-50 text-amber-600"}`}>
                      {r.checkedIn ? "Feito" : "Aguard."}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/payment/:id" element={<PaymentPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/checkin/:id" element={<CheckInPage />} />
        <Route path="/checkin/:id/termos" element={<TermsPage />} />
        <Route path="/scanner" element={<ScannerPage />} />
        <Route path="/validar-voucher/:docId/:code" element={<VoucherValidationPage />} />
      </Routes>
    </BrowserRouter>
  );
}
