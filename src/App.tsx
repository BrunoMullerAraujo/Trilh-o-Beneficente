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
  Users
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, auth, googleProvider } from "./lib/firebase";
import { 
  collection, 
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
import { DEFAULT_EVENT_CONFIG, EventConfig, REGISTRATION_STATUS, REGISTRATION_STATUS_FILTER_OPTIONS, REGISTRATION_STATUS_LABELS, isApprovedStatus } from "./types";

import * as XLSX from "xlsx";

// --- Components ---

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
          <span className="tracking-tighter">Ação Solidária</span>
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
  const [paymentConfigured, setPaymentConfigured] = useState(true);
  const [eventConfig, setEventConfig] = useState<EventConfig>(DEFAULT_EVENT_CONFIG);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    cpf: "",
    amount: 50,
    termsAccepted: false
  });

  useEffect(() => {
    fetch("/api/config/status")
      .then(resp => resp.json())
      .then(data => setPaymentConfigured(Boolean(data.mercadoPagoConfigured)))
      .catch(() => setPaymentConfigured(true));
  }, []);

  useEffect(() => {
    getDoc(doc(db, "events", "main")).then(snap => {
      if (!snap.exists()) return;
      const nextConfig = { ...DEFAULT_EVENT_CONFIG, ...snap.data() } as EventConfig;
      const allowedAmounts = Array.isArray(nextConfig.allowedAmounts) && nextConfig.allowedAmounts.length > 0
        ? nextConfig.allowedAmounts.map(Number).filter(amount => Number.isFinite(amount) && amount > 0)
        : DEFAULT_EVENT_CONFIG.allowedAmounts;

      setEventConfig({ ...nextConfig, allowedAmounts });
      if (!allowedAmounts.includes(formData.amount)) {
        setFormData(current => ({ ...current, amount: allowedAmounts[0] ?? DEFAULT_EVENT_CONFIG.allowedAmounts[0] }));
      }
    }).catch(() => undefined);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.termsAccepted) {
      alert("Você precisa aceitar os termos de uso.");
      return;
    }
    setLoading(true);
    
    try {
      const registrationResp = await fetch("/api/registrations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          cpf: formData.cpf,
          amount: formData.amount,
          termsAccepted: formData.termsAccepted,
        }),
      });

      const registrationData = await registrationResp.json();

      if (!registrationResp.ok) {
        const details = Array.isArray(registrationData.details)
          ? `\n${registrationData.details.join("\n")}`
          : "";
        throw new Error(`${registrationData.message || registrationData.error || "Erro desconhecido"}${details}`);
      }

      setLoading(false);
      navigate(`/payment/${registrationData.registrationId}`);
    } catch (error: any) {
      console.error("Erro ao registrar:", error);
      alert(`Erro: ${error.message}`);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar isAdmin={false} />
      
      {!paymentConfigured && (
        <div className="bg-amber-50 border-b border-amber-100 p-4 text-center">
            <p className="text-xs text-amber-700 font-medium flex items-center justify-center gap-2">
              <ShieldCheck size={14} />
              Atenção: Configure as chaves de API em Settings &gt; Secrets para aceitar pagamentos reais.
            </p>
        </div>
      )}
      
      <main className="max-w-4xl mx-auto px-4 py-12">
        <section className="text-center mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-extrabold text-brand-black tracking-tight mb-6"
          >
            {eventConfig.title}
          
          </motion.h1>
          <motion.p 
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.1 }}
             className="text-lg text-gray-600 max-w-2xl mx-auto"
          >
            {eventConfig.description}
          
          </motion.p>
        </section>

        <div className="grid md:grid-cols-2 gap-12 bg-white rounded-3xl p-8 shadow-xl shadow-gray-200/50 border border-gray-100">
          <div>
            <h2 className="text-2xl font-bold mb-6 text-brand-black">Inscrição Rápida</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input 
                    required
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none"
                    placeholder="João Silva"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input 
                      required
                      type="email"
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none"
                      placeholder="joao@exemplo.com"
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input 
                      required
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none"
                      placeholder="000.000.000-00"
                      value={formData.cpf}
                      onChange={e => setFormData({...formData, cpf: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input 
                    required
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-yellow transition-all outline-none"
                    placeholder="(00) 00000-0000"
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-2xl border border-dashed border-gray-200">
                <label className="block text-sm font-bold text-gray-700 mb-3">Valor da Inscrição (Cotas)</label>
                <div className="flex gap-2">
                  {eventConfig.allowedAmounts.map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setFormData({...formData, amount: val})}
                      className={`flex-1 py-3 rounded-xl font-bold transition-all ${
                        formData.amount === val 
                        ? 'bg-brand-black text-brand-yellow shadow-lg' 
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-brand-yellow'
                      }`}
                    >
                      R$ {val}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-2 py-2">
                <input 
                  type="checkbox" 
                  id="terms" 
                  required
                  className="mt-1 accent-brand-black w-4 h-4"
                  checked={formData.termsAccepted}
                  onChange={e => setFormData({...formData, termsAccepted: e.target.checked})}
                />
                <label htmlFor="terms" className="text-xs text-gray-500 leading-tight">
                  {eventConfig.termsText}
                
                </label>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-brand-black text-brand-yellow font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-all shadow-xl disabled:opacity-50"
              >
                {loading ? "Processando..." : (
                  <>
                    <span>Confirmar e Pagar PIX</span>
                    <ChevronRight size={20} />
                  </>
                )}
              </button>
              
              <p className="text-xs text-center text-gray-500 flex items-center justify-center gap-1">
                <ShieldCheck size={14} />
                Pagamento seguro processado via Mercado Pago
              </p>
            </form>
          </div>

          <div className="flex flex-col justify-center">
            <h3 className="text-xl font-bold mb-4 text-brand-black">Transparência</h3>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-brand-black flex-shrink-0">
                  <CheckCircle size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800">Inscrição Automática</h4>
                  <p className="text-sm text-gray-500">Seu comprovante é validado em segundos pelo sistema.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-brand-black flex-shrink-0">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800">Impacto Real</h4>
                  <p className="text-sm text-gray-500">Acompanhe no painel público o total já arrecadado.</p>
                </div>
              </div>
              <div className="mt-8 p-6 bg-brand-black rounded-3xl text-brand-yellow border border-brand-yellow/20">
                <div className="flex items-center gap-2 mb-2 opacity-80">
                  <Users size={18} />
                  <span className="text-sm font-medium uppercase tracking-wider">Meta Coletiva</span>
                </div>
                <div className="text-3xl font-black mb-2">R$ {eventConfig.targetAmount.toLocaleString('pt-BR')},00</div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                   <div className="h-full bg-brand-yellow w-1/3" />
                </div>
                <div className="flex justify-between mt-2 text-xs font-bold uppercase">
                  <span>Meta do evento</span>
                  <span>{eventConfig.active ? 'Ativo' : 'Pausado'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-gray-100 py-12 mt-12">
        <div className="max-w-4xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-gray-400">
            <Heart size={18} />
            <span className="text-sm italic">Festa do Bem &copy; 2024</span>
          </div>
          <div className="flex gap-8 text-xs font-bold text-gray-400 uppercase tracking-widest">
            <Link to="/admin" className="hover:text-rose-600 transition-all flex items-center gap-2">
              <ShieldCheck size={14} />
              Acesso Organizador
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
          {isApprovedStatus(reg.status) ? (
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
  const [regs, setRegs] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, count: 0, balance: 0 });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedReg, setSelectedReg] = useState<any>(null);
  const [viewLogs, setViewLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "registrations" | "settings">("dashboard");
  const [configStatus, setConfigStatus] = useState({
    mercadoPagoConfigured: false,
    webhookSecretConfigured: false,
    appUrlConfigured: false,
    loading: true,
  });
  const [eventDraft, setEventDraft] = useState<EventConfig>(DEFAULT_EVENT_CONFIG);
  const [eventAmountsInput, setEventAmountsInput] = useState(DEFAULT_EVENT_CONFIG.allowedAmounts.join(", "));

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));
    return unsubAuth;
  }, []);

  useEffect(() => {
    if (!user) return;

    fetch("/api/config/status")
      .then(resp => resp.json())
      .then(data => setConfigStatus({
        mercadoPagoConfigured: Boolean(data.mercadoPagoConfigured),
        webhookSecretConfigured: Boolean(data.webhookSecretConfigured),
        appUrlConfigured: Boolean(data.appUrlConfigured),
        loading: false,
      }))
      .catch(() => setConfigStatus(prev => ({ ...prev, loading: false })));

    getDoc(doc(db, "events", "main")).then(snap => {
      if (!snap.exists()) return;
      const config = { ...DEFAULT_EVENT_CONFIG, ...snap.data() } as EventConfig;
      setEventDraft(config);
      setEventAmountsInput((config.allowedAmounts || DEFAULT_EVENT_CONFIG.allowedAmounts).join(", "));
    }).catch(() => undefined);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    
    // Listen to registrations
    const q = query(collection(db, "registrations"), orderBy("createdAt", "desc"));
    const unsubRegs = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRegs(data);
      
      const confirmed = data.filter((r: any) => isApprovedStatus(r.status));
      setStats({
        total: data.length,
        count: confirmed.length,
        balance: confirmed.reduce((acc, curr: any) => acc + (Number(curr.amount) || 0), 0)
      });
    });

    // Listen to logs
    const lq = query(collection(db, "payment_logs"), orderBy("timestamp", "desc"), limit(50));
    const unsubLogs = onSnapshot(lq, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubRegs();
      unsubLogs();
    };
  }, [user]);

  const handleManualConfirm = async (id: string) => {
    if (!window.confirm("Deseja confirmar este pagamento MANUALMENTE? Use apenas se o webhook falhar.")) return;
    try {
      const { updateDoc, doc, serverTimestamp } = await import("firebase/firestore");
      await updateDoc(doc(db, "registrations", id), {
        status: REGISTRATION_STATUS.APPROVED,
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
      
      if (data.status === REGISTRATION_STATUS.APPROVED) {
        alert("Pagamento identificado como APROVADO no Mercado Pago! A inscrição foi atualizada.");
        setSelectedReg(null);
      } else {
        alert(`Status no Mercado Pago: ${data.status || "Pendente"}`);
      }
    } catch (e) {
      alert("Erro ao consultar Mercado Pago.");
    }
  };

  const saveEventConfig = async () => {
    const allowedAmounts = eventAmountsInput
      .split(",")
      .map(value => Number(value.trim()))
      .filter(value => Number.isFinite(value) && value > 0);

    if (!eventDraft.title.trim()) {
      alert("Informe o titulo do evento.");
      return;
    }

    if (allowedAmounts.length === 0) {
      alert("Informe ao menos uma cota valida.");
      return;
    }

    try {
      const { setDoc, doc, serverTimestamp } = await import("firebase/firestore");
      await setDoc(doc(db, "events", "main"), {
        ...eventDraft,
        title: eventDraft.title.trim(),
        description: eventDraft.description.trim(),
        termsText: eventDraft.termsText.trim(),
        targetAmount: Number(eventDraft.targetAmount) || 0,
        allowedAmounts,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || "",
      }, { merge: true });
      setEventDraft(current => ({ ...current, allowedAmounts }));
      alert("Configuracao do evento salva com sucesso.");
    } catch (error) {
      console.error("Erro ao salvar evento:", error);
      alert("Erro ao salvar configuracao do evento.");
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
            <h1>Ação Solidária - Festa do Bem</h1>
          </div>
          <div class="content">
            <div class="title">TERMO DE PARTICIPAÇÃO E RECIBO</div>
            <p>Confirmamos para os devidos fins que <strong>${reg.name}</strong>, inscrito sob o CPF <strong>${reg.cpf}</strong>, realizou a inscrição para o evento beneficente com a contribuição no valor de <strong>R$ ${reg.amount},00</strong>.</p>
            <p>Status do Pagamento: <strong>${isApprovedStatus(reg.status) ? 'CONFIRMADO' : REGISTRATION_STATUS_LABELS[reg.status as keyof typeof REGISTRATION_STATUS_LABELS]?.toUpperCase() || 'PENDENTE'}</strong></p>
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

  const login = () => signInWithPopup(auth, googleProvider);

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
      "Status": REGISTRATION_STATUS_LABELS[r.status as keyof typeof REGISTRATION_STATUS_LABELS] || r.status,
      "ID Mercado Pago": r.paymentId,
      "Inscrição": new Date(r.createdAt).toLocaleString('pt-BR'),
      "Confirmação": r.confirmedAt ? new Date(r.confirmedAt.seconds * 1000).toLocaleString('pt-BR') : isApprovedStatus(r.status) ? 'Confirmado' : '-'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inscritos");
    XLSX.writeFile(wb, `Festa_Bem_Inscritos_${new Date().toLocaleDateString()}.xlsx`);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 text-center">
        <div className="bg-white p-12 rounded-3xl shadow-xl max-w-md w-full border border-gray-100">
          <LayoutDashboard size={48} className="mx-auto mb-6 text-brand-black" />
          <h2 className="text-2xl font-bold mb-2">Painel de Controle</h2>
          <p className="text-gray-500 mb-8 lowercase">Acesso restrito para equipe de organização.</p>
          <button 
            onClick={login}
            className="w-full bg-brand-black text-brand-yellow font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-gray-800 transition-all shadow-lg"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" height="20" alt="" />
            Entrar com Google
          </button>
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
                  {regs.filter(r => isApprovedStatus(r.status)).slice(0, 5).map(r => (
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
                {REGISTRATION_STATUS_FILTER_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
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
                        <td className="px-6 py-5 font-bold">R$ {r.amount},00</td>
                        <td className="px-6 py-5">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            isApprovedStatus(r.status)
                            ? 'bg-emerald-100 text-emerald-700' 
                            : r.status === REGISTRATION_STATUS.CANCELLED
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-brand-yellow/20 text-brand-black'
                          }`}>
                            {REGISTRATION_STATUS_LABELS[r.status as keyof typeof REGISTRATION_STATUS_LABELS] || r.status}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right flex justify-end gap-2">
                          {isApprovedStatus(r.status) && (
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
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-2xl mx-auto">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-brand-black">
                   <CreditCard size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Integracao Mercado Pago</h3>
                  <p className="text-sm text-gray-500">Status das configuracoes aplicadas no servidor.</p>
                </div>
              </div>

              <div className="space-y-4">
                {[
                  ["Access Token", configStatus.mercadoPagoConfigured, "MERCADO_PAGO_ACCESS_TOKEN"],
                  ["Assinatura do Webhook", configStatus.webhookSecretConfigured, "MERCADO_PAGO_WEBHOOK_SECRET"],
                  ["URL da Aplicacao", configStatus.appUrlConfigured, "APP_URL"],
                ].map(([label, configured, envName]) => (
                  <div key={String(envName)} className="flex items-center justify-between gap-4 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-4">
                    <div>
                      <div className="text-sm font-bold text-gray-900">{label}</div>
                      <div className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">{envName}</div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                      {configStatus.loading ? 'Verificando' : configured ? 'Configurado' : 'Pendente'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 bg-amber-50 border border-amber-100 p-4 rounded-2xl text-xs text-amber-800 flex gap-3">
                <ShieldCheck size={20} className="flex-shrink-0" />
                <p>Os valores sensiveis ficam apenas nos segredos do servidor. O painel mostra somente se cada item esta configurado.</p>
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-2xl mx-auto mt-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-brand-black">
                  <Heart size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Evento</h3>
                  <p className="text-sm text-gray-500">Conteudo publico, cotas e meta da inscricao.</p>
                </div>
              </div>

              <div className="space-y-4">
                <input
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                  placeholder="Titulo"
                  value={eventDraft.title}
                  onChange={e => setEventDraft({ ...eventDraft, title: e.target.value })}
                />
                <textarea
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-yellow min-h-24"
                  placeholder="Descricao"
                  value={eventDraft.description}
                  onChange={e => setEventDraft({ ...eventDraft, description: e.target.value })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="date"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                    value={eventDraft.date}
                    onChange={e => setEventDraft({ ...eventDraft, date: e.target.value })}
                  />
                  <input
                    type="number"
                    min="0"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                    placeholder="Meta de arrecadacao"
                    value={eventDraft.targetAmount}
                    onChange={e => setEventDraft({ ...eventDraft, targetAmount: Number(e.target.value) })}
                  />
                </div>
                <input
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                  placeholder="Cotas separadas por virgula. Ex: 30, 50, 100"
                  value={eventAmountsInput}
                  onChange={e => setEventAmountsInput(e.target.value)}
                />
                <textarea
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-yellow min-h-20"
                  placeholder="Texto dos termos"
                  value={eventDraft.termsText}
                  onChange={e => setEventDraft({ ...eventDraft, termsText: e.target.value })}
                />
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <input
                    type="checkbox"
                    className="accent-brand-black w-4 h-4"
                    checked={eventDraft.active}
                    onChange={e => setEventDraft({ ...eventDraft, active: e.target.checked })}
                  />
                  Inscricoes ativas
                </label>
                <button
                  onClick={saveEventConfig}
                  className="w-full bg-brand-black text-brand-yellow font-bold py-4 rounded-2xl hover:bg-gray-800 transition-all shadow-lg"
                >
                  Salvar Evento
                </button>
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
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Mercado Pago ID</div>
                    <div className="font-mono text-xs text-gray-600">{selectedReg.paymentId}</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-3xl">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Status Sistema</div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className={`w-3 h-3 rounded-full ${isApprovedStatus(selectedReg.status) ? 'bg-green-500' : selectedReg.status === REGISTRATION_STATUS.CANCELLED ? 'bg-rose-500' : 'bg-amber-500'}`} />
                      <span className="font-black text-sm uppercase">{isApprovedStatus(selectedReg.status) ? 'Confirmado' : REGISTRATION_STATUS_LABELS[selectedReg.status as keyof typeof REGISTRATION_STATUS_LABELS] || 'Aguardando'}</span>
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
                  {!isApprovedStatus(selectedReg.status) && (
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
