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
          <span className="tracking-tighter">Trilho Beneficente</span>
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
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    cpf: "",
    amount: 50,
    termsAccepted: false
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.termsAccepted) {
      alert("Você precisa aceitar os termos de uso.");
      return;
    }
    setLoading(true);
    
    try {
      const resp = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_amount: formData.amount,
          description: "Inscrição Evento Beneficente",
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
      });

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
      let docRef;
      try {
        docRef = await addDoc(collection(db, "registrations"), {
          ...formData,
          status: "pending",
          paymentId: String(mpData.id),
          pixCode: mpData.point_of_interaction?.transaction_data?.qr_code_base64 || "",
          copyPaste: mpData.point_of_interaction?.transaction_data?.qr_code || "",
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, "registrations");
        throw error;
      }

      setLoading(false);
      navigate(`/payment/${docRef.id}`);
    } catch (error: any) {
      console.error("Erro ao registrar:", error);
      alert(`Erro: ${error.message}`);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar isAdmin={false} />
      
      {!import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY && (
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
            Sua participação <span className="bg-brand-yellow px-2">transforma vidas</span>.
          </motion.h1>
          <motion.p 
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.1 }}
             className="text-lg text-gray-600 max-w-2xl mx-auto"
          >
            Participe do nosso 2º Mega Evento Solidário. 100% da arrecadação é destinada a projetos de impacto local.
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
                  {[30, 50, 100].map(val => (
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
                  Aceito os termos do evento e autorizo o uso dos meus dados para fins de confirmação de inscrição e prestação de contas.
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
                <div className="text-3xl font-black mb-2">R$ 15.000,00</div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                   <div className="h-full bg-brand-yellow w-1/3" />
                </div>
                <div className="flex justify-between mt-2 text-xs font-bold uppercase">
                  <span>R$ 5.000 alcançados</span>
                  <span>33%</span>
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
      return "Este domínio não está autorizado no Firebase Authentication. Adicione localhost e o domínio publicado em Authentication > Settings > Authorized domains.";
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
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Mercado Pago ID</div>
                    <div className="font-mono text-xs text-gray-600">{selectedReg.paymentId}</div>
                  </div>
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
