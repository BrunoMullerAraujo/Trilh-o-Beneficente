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
  Flag
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, auth, googleProvider, handleFirestoreError, OperationType } from "./lib/firebase";
import { 
  collection, 
  addDoc, 
  doc, 
  getDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  getDocs,
  Timestamp,
  limit
} from "firebase/firestore";
import { signInWithPopup, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";

import * as XLSX from "xlsx";

// --- Components ---

const isLocalDevelopment = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
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

const LandingPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingCep, setLoadingCep] = useState(false);
  const [formData, setFormData] = useState({
    name: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.name : "",
    birthDate: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.birthDate : "",
    cpf: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.cpf : "",
    email: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.email : "",
    phone: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.phone : "",
    guardianName: "",
    guardianCpf: "",
    cep: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.cep : "",
    street: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.street : "",
    number: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.number : "",
    neighborhood: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.neighborhood : "",
    city: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.city : "",
    state: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.state : "",
    motorcycle: shouldPrefillTestBuyer ? mercadoPagoBuyerTestData.motorcycle : "",
    amount: 1,
    termsAccepted: shouldPrefillTestBuyer,
  });

  const isMinor = (() => {
    if (!formData.birthDate) return false;
    const birth = new Date(formData.birthDate);
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
    if (digits.length !== 8) return;
    setLoadingCep(true);
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
    } catch {}
    setLoadingCep(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.termsAccepted) {
      alert("Você precisa aceitar os termos de uso.");
      return;
    }
    setLoading(true);
    setLoadingMessage("Gerando Pix...");
    
    try {
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

      // 2. Save registration with status 'pending' to Firestore
      setLoadingMessage("Salvando inscrição...");
      let docRef;
      try {
        docRef = await withTimeout(addDoc(collection(db, "registrations"), {
          ...formData,
          status: "pending",
          paymentId: String(mpData.id),
          orderId: mpData.orderId || "",
          pixCode: mpData.point_of_interaction?.transaction_data?.qr_code_base64 || "",
          copyPaste: mpData.point_of_interaction?.transaction_data?.qr_code || "",
          createdAt: new Date().toISOString(),
        }), 15000, "O Pix foi gerado, mas o Firestore demorou para salvar a inscrição. Verifique se o Firestore Database foi criado e se as regras foram publicadas.");
      } catch (error) {
        console.error("Erro ao salvar inscrição no Firestore:", error);
        throw new Error("O Pix foi gerado, mas não foi possível salvar a inscrição no Firestore. Verifique se o Firestore Database foi criado e se as regras foram publicadas.");
      }

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
              A Associação de Apoio aos Pacientes com Câncer de Presidente Olegário oferece transporte gratuito, suporte emocional e assistência a quem mais precisa. Cada real arrecadado vai direto para essa causa.
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
                      <div className="relative">
                        <Calendar className="absolute left-3 top-3 text-gray-400" size={18} />
                        <input required type="date" autoComplete="bdate" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" value={formData.birthDate} onChange={e => set("birthDate", e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-3 text-gray-400" size={18} />
                        <input required inputMode="numeric" autoComplete="off" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" placeholder="000.000.000-00" value={formData.cpf} onChange={e => set("cpf", e.target.value)} />
                      </div>
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
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-3.5 text-gray-400" size={16} />
                        <input required inputMode="numeric" className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none text-base" placeholder="123" value={formData.number} onChange={e => set("number", e.target.value)} />
                      </div>
                    </div>
                  </div>
                  {formData.street && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2.5">
                      <MapPin size={13} className="text-gray-400 flex-shrink-0" />
                      <span>{formData.street} — {formData.neighborhood}, {formData.city}/{formData.state}</span>
                    </div>
                  )}
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
    </div>
  );
};

const PaymentPage = () => {
  const { id } = useParams();
  const [reg, setReg] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "registrations", id), (snap) => {
      setReg(snap.data());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `registrations/${id}`);
    });
    return unsub;
  }, [id]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(reg.copyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!reg) return <div className="h-screen flex items-center justify-center">Carregando...</div>;

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
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium lowercase">Participante</span>
                  <span className="text-brand-black font-bold">{reg.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium lowercase">Valor</span>
                  <span className="text-brand-black font-bold">R$ {reg.amount},00</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium lowercase">ID Transação</span>
                  <span className="text-brand-black font-mono text-xs">{reg.paymentId}</span>
                </div>
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
                <div className="text-3xl font-black">R$ {reg.amount},00</div>
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
  const [configLocked, setConfigLocked] = useState(true);
  const [configPass, setConfigPass] = useState("");
  const [mpConfig, setMpConfig] = useState({
    accessToken: "",
    publicKey: ""
  });

  const checkConfigAccess = () => {
    if (configPass === "Bmag1986*") {
      setConfigLocked(false);
    } else {
      alert("Senha de configuração incorreta.");
    }
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

    return () => {
      unsubRegs();
      unsubLogs();
    };
  }, [user, isAdminUser]);

  const handleManualConfirm = async (id: string) => {
    if (!window.confirm("Deseja confirmar este pagamento MANUALMENTE? Use apenas se o webhook falhar.")) return;
    try {
      const { updateDoc, doc, serverTimestamp } = await import("firebase/firestore");
      await updateDoc(doc(db, "registrations", id), {
        status: "approved",
        confirmedAt: serverTimestamp(),
        manualConfirmation: true,
        adminEmail: user?.email
      });
      setSelectedReg(null);
      alert("Inscrição confirmada com sucesso!");
    } catch (e) {
      alert("Erro ao atualizar status.");
    }
  };

  const handleSyncPayment = async (paymentId: string) => {
    if (!paymentId) return;
    try {
      const resp = await fetch(`/api/payments/verify/${paymentId}`);
      const data = await resp.json();
      
      if (data.status === "approved") {
        alert("Pagamento identificado como APROVADO no Mercado Pago! A inscrição foi atualizada.");
        setSelectedReg(null);
      } else {
        alert(`Status no Mercado Pago: ${data.status || "Pendente"}`);
      }
    } catch (e) {
      alert("Erro ao consultar Mercado Pago.");
    }
  };

  const shareEventLink = () => {
    const url = window.location.origin;
    navigator.clipboard.writeText(url);
    alert("Link do evento copiado para a área de transferência!");
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
            <p>Confirmamos para os devidos fins que <strong>${reg.name}</strong>, inscrito sob o CPF <strong>${reg.cpf}</strong>, realizou a inscrição para o evento beneficente com a contribuição no valor de <strong>R$ ${reg.amount},00</strong>.</p>
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
      r.cpf?.includes(searchTerm);
    const matchesFilter = filterStatus === "all" || r.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const exportToExcel = () => {
    const dataToExport = regs.map(r => ({
      "Nome": r.name,
      "CPF": r.cpf,
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
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 bg-gray-900 text-white flex-shrink-0 flex flex-col h-auto md:h-[calc(100vh-64px)] overflow-y-auto">
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

      <main className="flex-1 overflow-y-auto h-screen p-4 md:p-8">
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
                      <div className="text-brand-black font-black">+ R$ {r.amount}</div>
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
                      <th className="px-6 py-4">Participante</th>
                      <th className="px-6 py-4">Data</th>
                      <th className="px-6 py-4">Valor</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-sm">
                    {filteredRegs.map((r: any) => (
                      <tr key={r.id} className="hover:bg-gray-50/50 transition-all cursor-default text-brand-black">
                        <td className="px-6 py-5">
                          <div className="font-bold">{r.name}</div>
                          <div className="text-xs text-gray-400">{r.email}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm font-medium text-gray-700">{new Date(r.createdAt).toLocaleDateString('pt-BR')}</div>
                          <div className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td className="px-6 py-5 font-bold">R$ {r.amount},00</td>
                        <td className="px-6 py-5">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            r.status === 'approved' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-brand-yellow/20 text-brand-black'
                          }`}>
                            {r.status === 'approved' ? 'Pago' : 'Pendente'}
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {configLocked ? (
              <div className="bg-white p-12 rounded-3xl shadow-xl max-w-md mx-auto text-center border border-gray-100 mt-12">
                <ShieldCheck size={48} className="mx-auto mb-6 text-brand-black" />
                <h2 className="text-2xl font-bold mb-2 text-brand-black">Configurações Sensíveis</h2>
                <p className="text-gray-500 mb-8 text-sm">Insira a senha mestra para acessar os dados de integração.</p>
                <input 
                  type="password"
                  placeholder="Senha Administrativa"
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-6 py-3 mb-4 outline-none focus:ring-2 focus:ring-brand-yellow font-medium"
                  value={configPass}
                  onChange={e => setConfigPass(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && checkConfigAccess()}
                />
                <button 
                  onClick={checkConfigAccess}
                  className="w-full bg-brand-black text-brand-yellow font-bold py-4 rounded-2xl hover:bg-gray-800 transition-all shadow-lg"
                >
                  Desbloquear Acesso
                </button>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-2xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-brand-black">
                     <CreditCard size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Integração Mercado Pago</h3>
                    <p className="text-sm text-gray-500">Configurações de gateaway de pagamento.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-xs text-amber-800 flex gap-3">
                    <ShieldCheck size={20} className="flex-shrink-0" />
                    <p>Essas configurações são aplicadas no servidor. Certifique-se de que o <strong>APP_URL</strong> está configurado corretamente no painel do sistema para que o webhook funcione.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Access Token</label>
                    <input 
                      type="password"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-yellow"
                      placeholder="APP_USR-..."
                      defaultValue="Mantenha o valor atual dos Segredos"
                      readOnly
                    />
                    <p className="mt-1 text-[10px] text-gray-400">Atualmente carregado via environment secrets (Recomendado).</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Public Key</label>
                    <input 
                      type="text"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-yellow"
                      placeholder="APP_USR-..."
                      defaultValue={import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY || "Não configurada"}
                      readOnly
                    />
                  </div>

                  <div className="pt-6 border-t border-gray-50">
                    <button 
                      onClick={() => setConfigLocked(true)}
                      className="text-sm font-bold text-gray-400 hover:text-brand-black transition-all flex items-center gap-2"
                    >
                      <ShieldCheck size={16} />
                      Bloquear configurações novamente
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                  <button onClick={() => setSelectedReg(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
                    <Users size={20} className="text-gray-400" />
                  </button>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-3xl">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Nome</div>
                      <div className="font-bold text-gray-800 text-sm truncate">{selectedReg.name}</div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-3xl">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">CPF</div>
                      <div className="font-bold text-gray-800 text-sm">{selectedReg.cpf}</div>
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
                      <div className={`w-3 h-3 rounded-full ${selectedReg.status === 'approved' ? 'bg-green-500' : 'bg-amber-500'}`} />
                      <span className="font-black text-sm uppercase">{selectedReg.status === 'approved' ? 'Confirmado' : 'Aguardando'}</span>
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
                  {selectedReg.status !== 'approved' && (
                    <button 
                      onClick={() => handleManualConfirm(selectedReg.id)}
                      className="w-full bg-brand-black text-brand-yellow font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-all shadow-lg border border-brand-yellow/20"
                    >
                      <CheckCircle size={18} />
                      Confirmar Manualmente
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
