import React, { useState, useEffect } from "react";
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
  XCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
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

// --- Constants ---
const EVENT_PRICE = 1;

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
    <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl text-brand-black">
          <Heart className="text-brand-yellow fill-brand-yellow" size={20} />
          <span className="tracking-tighter">Trilhão Beneficente</span>
        </Link>
        <div className="flex gap-4 items-center">
          {user && (
            <Link to="/admin" className="text-brand-black hover:bg-brand-yellow font-bold text-sm flex items-center gap-2 bg-brand-yellow/80 hover:text-brand-black px-4 py-2 rounded-xl transition-all shadow-sm">
              <LayoutDashboard size={18} />
              <span>Painel Admin</span>
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
    if (allowMultipleCpf) return;
    const digits = cpf.replace(/\D/g, "");
    if (digits.length !== 11) {
      setExistingReg(null);
      return;
    }
    setCheckingCpf(true);
    try {
      const snap = await getDocs(query(collection(db, "registrations"), where("cpf", "==", digits)));
      if (!snap.empty) {
        setExistingReg({ id: snap.docs[0].id, data: snap.docs[0].data() });
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
    if (!formData.shirtSize) {
      alert("Selecione o tamanho da camiseta.");
      return;
    }
    const sizeQty = inventory[formData.shirtSize] ?? 0;
    if (sizeQty <= 0) {
      alert("O tamanho selecionado não está mais disponível. Escolha outro.");
      return;
    }
    setLoading(true);
    setLoadingMessage("Verificando CPF...");

    try {
      // Bloqueia CPF duplicado antes de criar o pagamento (salvo se admin liberou múltiplas inscrições)
      if (!allowMultipleCpf) {
        const cpfDigits = formData.cpf.replace(/\D/g, "");
        const cpfSnap = await withTimeout(
          getDocs(query(collection(db, "registrations"), where("cpf", "==", cpfDigits))),
          10000,
          "Tempo limite ao verificar CPF."
        );
        if (!cpfSnap.empty) {
          setLoading(false);
          setLoadingMessage("");
          setExistingReg({ id: cpfSnap.docs[0].id, data: cpfSnap.docs[0].data() });
          return;
        }
      }

      setLoadingMessage("Gerando Pix...");
      const resp = await withTimeout(fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_amount: formData.amount,
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
            createdAt: new Date().toISOString(),
          });
        }), 15000, "O Pix foi gerado, mas o Firestore demorou para salvar a inscrição. Verifique se o Firestore Database foi criado e se as regras foram publicadas.");
      } catch (error) {
        console.error("Erro ao salvar inscrição no Firestore:", error);
        throw new Error("O Pix foi gerado, mas não foi possível salvar a inscrição no Firestore. Verifique se o Firestore Database foi criado e se as regras foram publicadas.");
      }
      const docRef = newRegRef;

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
      <section className="max-w-5xl mx-auto px-0 md:px-4 py-10 md:py-16" id="inscricao">
        <div className="grid md:grid-cols-2 gap-12 bg-white rounded-2xl md:rounded-3xl mx-4 md:mx-0 p-5 md:p-10 shadow-sm md:shadow-xl shadow-gray-200/50 border border-gray-100 items-start">
          <div>
            <div className="mb-6">
              <span className="text-xs font-black text-brand-yellow bg-brand-black px-3 py-1 rounded-full uppercase tracking-widest">Inscrições abertas</span>
              <h2 className="text-3xl font-black text-brand-black mt-3 tracking-tight">Ficha de Inscrição</h2>
              <p className="text-gray-500 text-sm mt-1">Preencha os dados do piloto e pague via PIX para confirmar sua participação.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Dados do Piloto */}
              <div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Dados do Piloto</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input required autoComplete="name" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" placeholder="João da Silva" value={formData.name} onChange={e => set("name", e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Data de Nascimento</label>
                      <div className="flex gap-1.5">
                        <input
                          required
                          inputMode="numeric"
                          maxLength={2}
                          placeholder="DD"
                          className="w-16 px-2 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base text-center"
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
                          className="w-16 px-2 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base text-center"
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
                          className="flex-1 px-2 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base text-center"
                          value={birthYear}
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                            setBirthYear(v);
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Dia · Mês · Ano</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-3 text-gray-400" size={18} />
                        <input required inputMode="numeric" autoComplete="off" maxLength={14} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" placeholder="000.000.000-00" value={formData.cpf} onChange={e => {
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
                        {checkingCpf && <span className="absolute right-3 top-3 text-xs text-gray-400">verificando...</span>}
                      </div>
                      {cpfError && <p className="text-red-500 text-xs mt-1">{cpfError}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                      <div className="relative">
                        <Smartphone className="absolute left-3 top-3 text-gray-400" size={18} />
                        <input required type="tel" inputMode="tel" autoComplete="tel" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" placeholder="(34) 99999-9999" value={formData.phone} onChange={e => set("phone", e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 text-gray-400" size={18} />
                        <input required type="email" inputMode="email" autoComplete="email" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" placeholder="joao@email.com" value={formData.email} onChange={e => set("email", e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contato de Emergência */}
              <div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Contato de Emergência</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Contato</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input required autoComplete="off" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" placeholder="Nome do familiar ou amigo" value={formData.emergencyName} onChange={e => set("emergencyName", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefone do Contato</label>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input required type="tel" inputMode="tel" autoComplete="off" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" placeholder="(34) 99999-9999" value={formData.emergencyPhone} onChange={e => set("emergencyPhone", e.target.value)} />
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
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                      <p className="text-xs font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
                        <UserCheck size={14} />
                        Responsável Legal (Piloto Menor de Idade)
                      </p>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo do Responsável</label>
                        <div className="relative">
                          <User className="absolute left-3 top-3 text-gray-400" size={18} />
                          <input required={isMinor} autoComplete="name" className="w-full pl-10 pr-4 py-3 border border-amber-200 bg-white rounded-xl focus:ring-2 focus:ring-brand-yellow outline-none text-base" placeholder="Maria da Silva" value={formData.guardianName} onChange={e => set("guardianName", e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">CPF do Responsável</label>
                        <div className="relative">
                          <CreditCard className="absolute left-3 top-3 text-gray-400" size={18} />
                          <input required={isMinor} inputMode="numeric" autoComplete="off" className="w-full pl-10 pr-4 py-3 border border-amber-200 bg-white rounded-xl focus:ring-2 focus:ring-brand-yellow outline-none text-base" placeholder="000.000.000-00" value={formData.guardianCpf} onChange={e => set("guardianCpf", e.target.value)} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Endereço */}
              <div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Endereço</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3.5 text-gray-400" size={16} />
                        <input required inputMode="numeric" autoComplete="postal-code" className="w-full pl-9 pr-8 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" placeholder="00000-000" maxLength={9} value={formData.cep} onChange={e => handleCepChange(e.target.value)} />
                        {loadingCep && <Loader2 className="absolute right-2.5 top-3.5 text-gray-400 animate-spin" size={16} />}
                      </div>
                      {cepError && <p className="text-amber-600 text-xs mt-1">{cepError}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-3.5 text-gray-400" size={16} />
                        <input required inputMode="numeric" className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" placeholder="123" value={formData.number} onChange={e => set("number", e.target.value)} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rua</label>
                    <input required autoComplete="address-line1" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" placeholder="Nome da rua" value={formData.street} onChange={e => set("street", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                      <input required autoComplete="address-level3" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" placeholder="Bairro" value={formData.neighborhood} onChange={e => set("neighborhood", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                      <input required autoComplete="address-level2" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" placeholder="Cidade" value={formData.city} onChange={e => set("city", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                    <input required autoComplete="address-level1" maxLength={2} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base uppercase" placeholder="UF" value={formData.state} onChange={e => set("state", e.target.value.toUpperCase())} />
                  </div>
                </div>
              </div>

              {/* Moto */}
              <div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Motocicleta</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição da Motocicleta</label>
                  <div className="relative">
                    <Bike className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input required autoComplete="off" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" placeholder="Ex: Honda XR 190, 2021, Preta" value={formData.motorcycle} onChange={e => set("motorcycle", e.target.value)} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Marca, modelo, ano e cor</p>
                </div>
              </div>

              {/* Camiseta */}
              <div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Camiseta do Evento</p>
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
                          className={`w-full py-3 rounded-xl font-black text-sm border-2 transition-all
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
                {!formData.shirtSize && <p className="text-xs text-gray-400 mt-2">Selecione um tamanho para continuar.</p>}
              </div>

              {/* Valor */}
              <div className="bg-brand-black rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-brand-yellow/60 uppercase tracking-widest mb-0.5">Valor da Inscrição</p>
                  <p className="text-2xl font-black text-brand-yellow">R$ 1,00</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-0.5">Inscrições até</p>
                  <p className="text-sm font-black text-white">11/07/2026</p>
                </div>
              </div>

              <div className="flex items-start gap-2 py-1">
                <input type="checkbox" id="terms" required className="mt-1 accent-brand-black w-4 h-4" checked={formData.termsAccepted} onChange={e => set("termsAccepted", e.target.checked)} />
                <label htmlFor="terms" className="text-xs text-gray-500 leading-tight">
                  Aceito os termos do evento e autorizo o uso dos meus dados para confirmação de inscrição e prestação de contas à ASSOAPAC.
                </label>
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-brand-black text-brand-yellow font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-all shadow-xl disabled:opacity-50 text-base tracking-wide">
                {loading ? loadingMessage || "Processando..." : (<><span>Confirmar Inscrição via PIX</span><ChevronRight size={20} /></>)}
              </button>

              <p className="text-xs text-center text-gray-400 flex items-center justify-center gap-1">
                <ShieldCheck size={13} />
                Pagamento seguro via Mercado Pago
              </p>
            </form>
          </div>

          {/* Painel direito */}
          <div className="hidden md:flex flex-col gap-6 md:sticky md:top-20">
            <div className="space-y-4">
              <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-2xl">
                <div className="w-10 h-10 bg-brand-black rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle size={18} className="text-brand-yellow" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 text-sm">Confirmação instantânea</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Pague via PIX e receba a confirmação da sua inscrição automaticamente, sem burocracia.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-2xl">
                <div className="w-10 h-10 bg-brand-black rounded-xl flex items-center justify-center flex-shrink-0">
                  <Mountain size={18} className="text-brand-yellow" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 text-sm">Trilha Offroad</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Percurso desafiador em terreno offroad pelas estradas e campos ao redor de Presidente Olegário — MG.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-2xl">
                <div className="w-10 h-10 bg-brand-black rounded-xl flex items-center justify-center flex-shrink-0">
                  <HandHeart size={18} className="text-brand-yellow" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 text-sm">100% para a ASSOAPAC</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Cada real arrecadado custeia transporte, alimentação e suporte a pacientes com câncer e suas famílias.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-2xl">
                <div className="w-10 h-10 bg-brand-black rounded-xl flex items-center justify-center flex-shrink-0">
                  <Bike size={18} className="text-brand-yellow" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 text-sm">Todas as motos bem-vindas</h4>
                  <p className="text-xs text-gray-500 mt-0.5">O evento é aberto a motociclistas de todos os estilos e cilindradas que queiram unir aventura e solidariedade.</p>
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

const PaymentPage = () => {
  const { id } = useParams();
  const [reg, setReg] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

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
      <main className="max-w-lg mx-auto px-4 py-12">
        <AnimatePresence mode="wait">
          {reg.status === 'approved' ? (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl p-10 text-center shadow-xl border border-green-100"
            >
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm">
                <CheckCircle size={48} />
              </div>
              <h2 className="text-3xl font-black text-brand-black mb-2">Pagamento Confirmado!</h2>
              <p className="text-gray-500 mb-8">Sua inscrição foi validada com sucesso. Obrigado pelo seu apoio!</p>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-left space-y-3">
                {reg.registrationNumber && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 font-medium lowercase">Nº Inscrição</span>
                    <span className="text-brand-black font-black font-mono">#{reg.registrationNumber}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium lowercase">Participante</span>
                  <span className="text-brand-black font-bold">{reg.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium lowercase">Valor</span>
                  <span className="text-brand-black font-bold">{formatCurrency(reg.amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium lowercase">ID Transação</span>
                  <span className="text-brand-black font-mono text-xs">{reg.paymentId}</span>
                </div>
                {reg.guardianName && (
                  <div className="pt-3 mt-1 border-t border-gray-100 space-y-2">
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Responsável Legal</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium lowercase">Nome</span>
                      <span className="text-brand-black font-bold">{reg.guardianName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium lowercase">CPF</span>
                      <span className="text-brand-black font-mono text-xs">{formatCPF(reg.guardianCpf)}</span>
                    </div>
                  </div>
                )}
              </div>
              <button
                 onClick={() => window.print()}
                 className="mt-8 text-brand-black font-bold text-sm uppercase tracking-widest hover:underline bg-brand-yellow/30 px-6 py-2 rounded-full"
              >
                Imprimir Comprovante
              </button>
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
  const [activeTab, setActiveTab] = useState<"dashboard" | "registrations" | "settings">("dashboard");
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
            showToast(data.error || "Erro ao cancelar inscrição.", "error");
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
            <p>Data da Inscrição: ${new Date(reg.createdAt).toLocaleDateString('pt-BR')}</p>
            <div style="margin-top: 50px; border-top: 1px solid #ccc; width: 300px; margin-left: auto; margin-right: auto; padding-top: 10px; text-align: center;">
              Assinatura da Organização
            </div>
          </div>
          <div class="footer">
            Documento gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}<br>
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

  const exportToExcel = () => {
    const dataToExport = regs.map(r => ({
      "Nº": r.registrationNumber ? `#${r.registrationNumber}` : "-",
      "Nome": r.name,
      "CPF": formatCPF(r.cpf),
      "Email": r.email,
      "WhatsApp": r.phone,
      "Valor": r.amount,
      "Status": r.status === 'approved' ? 'Pago' : 'Pendente',
      "ID Mercado Pago": r.paymentId,
      "Inscrição": new Date(r.createdAt).toLocaleString('pt-BR'),
      "Confirmação": r.confirmedAt ? new Date(r.confirmedAt.seconds * 1000).toLocaleString('pt-BR') : r.status === 'approved' ? 'Confirmado' : '-'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inscritos");
    XLSX.writeFile(wb, `Festa_Bem_Inscritos_${new Date().toLocaleDateString()}.xlsx`);
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
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex z-40">
          {[
            { tab: "dashboard" as const, icon: <LayoutDashboard size={20} />, label: "Dashboard" },
            { tab: "registrations" as const, icon: <Users size={20} />, label: "Inscrições" },
            { tab: "settings" as const, icon: <ShieldCheck size={20} />, label: "Config" },
          ].map(({ tab, icon, label }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-bold transition-all ${
                activeTab === tab ? "text-brand-black" : "text-gray-400"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>

        {/* Sidebar Navigation */}
        <aside className="hidden md:flex w-full md:w-64 bg-gray-900 text-white flex-shrink-0 flex-col h-auto md:h-[calc(100vh-64px)] overflow-y-auto">
        <div className="p-6 flex items-center gap-2 font-black text-brand-yellow border-b border-white/10">
          <Heart size={24} className="fill-brand-yellow" />
          <span>PORTAL ADM</span>
        </div>
        <nav className="p-4 space-y-2">
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
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'settings' ? 'bg-brand-yellow text-brand-black shadow-md' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <ShieldCheck size={20} />
            Configurações
          </button>
          <div className="pt-4 pb-2 text-[10px] font-black text-white/30 uppercase tracking-widest px-4">Recursos</div>
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
        <div className="mt-auto p-4 border-t border-white/10">
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

      <main className="flex-1 overflow-y-auto h-screen p-4 md:p-8 pb-20 md:pb-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
              {activeTab === 'dashboard' ? 'Visão Geral' : activeTab === 'registrations' ? 'Gestão de Inscritos' : 'Configurações'}
            </h1>
            <p className="text-sm text-gray-500">Gestão financeira e operacional do evento beneficente.</p>
          </div>
          <button 
            onClick={() => setActiveTab("registrations")}
            className="md:hidden p-2 bg-white border border-gray-200 rounded-xl"
          >
            <Users size={20} />
          </button>
        </header>

        {activeTab === 'dashboard' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Arrecadação PIX</div>
                <div className="text-2xl font-black text-brand-black">R$ {stats.balance.toLocaleString('pt-BR')},00</div>
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
                        <div className="text-[10px] text-gray-400 uppercase font-bold">{new Date(r.createdAt).toLocaleDateString()}</div>
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
                          <div className="text-sm font-medium text-gray-700">{new Date(r.createdAt).toLocaleDateString('pt-BR')}</div>
                          <div className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
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
    </div>
  );
};

// --- Main App ---

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/payment/:id" element={<PaymentPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
