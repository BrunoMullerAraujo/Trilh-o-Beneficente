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

// --- Components ---

const Navbar = ({ isAdmin }: { isAdmin: boolean }) => (
  <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2 font-bold text-xl text-rose-600">
        <Heart className="fill-rose-600" />
        <span>Ação Solidária</span>
      </Link>
      <div className="flex gap-4 items-center">
        {isAdmin && (
          <Link to="/admin" className="text-gray-600 hover:text-rose-600 font-medium flex items-center gap-1">
            <LayoutDashboard size={18} />
            <span className="hidden sm:inline">Painel Admin</span>
          </Link>
        )}
      </div>
    </div>
  </nav>
);

const LandingPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    cpf: "",
    amount: 50
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // 1. Create payment on Mercado Pago via our API
      const response = await fetch("/api/payments/create", {
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

      const mpData = await response.json();
      
      if (mpData.error) throw new Error(mpData.error);

      // 2. Save registration with status 'pending' to Firestore
      const docRef = await addDoc(collection(db, "registrations"), {
        ...formData,
        status: "pending",
        paymentId: mpData.id,
        pixCode: mpData.point_of_interaction.transaction_data.qr_code_base64,
        copyPaste: mpData.point_of_interaction.transaction_data.qr_code,
        createdAt: new Date().toISOString(),
      });

      setLoading(false);
      navigate(`/payment/${docRef.id}`);
    } catch (error) {
      console.error("Erro ao registrar:", error);
      alert("Houve um erro ao gerar o pagamento. Verifique os dados.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar isAdmin={false} />
      
      <main className="max-w-4xl mx-auto px-4 py-12">
        <section className="text-center mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-extrabold text-gray-900 tracking-tight mb-6"
          >
            Sua participação <span className="text-rose-600">transforma vidas</span>.
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
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Inscrição Rápida</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input 
                    required
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500 transition-all outline-none"
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
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500 transition-all outline-none"
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
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500 transition-all outline-none"
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
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500 transition-all outline-none"
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
                        ? 'bg-rose-600 text-white shadow-lg' 
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-rose-400'
                      }`}
                    >
                      R$ {val}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-gray-900 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-all shadow-xl disabled:opacity-50"
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
            <h3 className="text-xl font-bold mb-4 text-gray-800">Transparência</h3>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 flex-shrink-0">
                  <CheckCircle size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800">Inscrição Automática</h4>
                  <p className="text-sm text-gray-500">Seu comprovante é validado em segundos pelo sistema.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 flex-shrink-0">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800">Impacto Real</h4>
                  <p className="text-sm text-gray-500">Acompanhe no painel público o total já arrecadado.</p>
                </div>
              </div>
              <div className="mt-8 p-6 bg-rose-600 rounded-3xl text-white">
                <div className="flex items-center gap-2 mb-2 opacity-80">
                  <Users size={18} />
                  <span className="text-sm font-medium uppercase tracking-wider">Meta Coletiva</span>
                </div>
                <div className="text-3xl font-black mb-2">R$ 15.000,00</div>
                <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
                   <div className="h-full bg-white w-1/3" />
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
          {reg.status === 'approved' ? (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl p-10 text-center shadow-xl border border-green-100"
            >
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={48} />
              </div>
              <h2 className="text-3xl font-black text-gray-900 mb-2">Pagamento Confirmado!</h2>
              <p className="text-gray-500 mb-8">Sua inscrição foi validada com sucesso. Obrigado pelo seu apoio!</p>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-left space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium lowercase">Participante</span>
                  <span className="text-gray-900 font-bold">{reg.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium lowercase">Valor</span>
                  <span className="text-gray-900 font-bold">R$ {reg.amount},00</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium lowercase">ID Transação</span>
                  <span className="text-gray-900 font-mono text-xs">{reg.paymentId}</span>
                </div>
              </div>
              <button 
                 onClick={() => window.print()}
                 className="mt-8 text-rose-600 font-bold text-sm uppercase tracking-widest hover:underline"
              >
                Imprimir Comprovante
              </button>
            </motion.div>
          ) : (
            <motion.div 
               key="pix"
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="bg-white rounded-3xl p-8 shadow-xl"
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
                   <CreditCard size={20} />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">Finalizar Pagamento</h2>
              </div>

              <div className="bg-gray-900 rounded-2xl p-4 mb-8 text-center text-white">
                <div className="text-sm font-medium opacity-60 uppercase tracking-widest mb-1">A pagar</div>
                <div className="text-3xl font-black">R$ {reg.amount},00</div>
              </div>

              <div className="space-y-6">
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-white p-4 border-2 border-dashed border-gray-100 rounded-3xl group transition-all hover:border-rose-400">
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
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs font-mono text-gray-600 outline-none"
                      value={reg.copyPaste}
                    />
                    <button 
                       onClick={copyToClipboard}
                       className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-3 rounded-xl transition-all"
                    >
                      {copied ? <CheckCircle size={20} className="text-green-600" /> : <Copy size={20} />}
                    </button>
                  </div>
                </div>

                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex gap-3 text-rose-700">
                   <Clock className="flex-shrink-0" size={20} />
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
  const [stats, setStats] = useState({ total: 0, count: 0 });

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));
    return unsubAuth;
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "registrations"), orderBy("createdAt", "desc"));
    const unsubRegs = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRegs(data);
      
      const confirmed = data.filter((r: any) => r.status === 'approved');
      setStats({
        total: confirmed.reduce((acc, curr: any) => acc + (curr.amount || 0), 0),
        count: confirmed.length
      });
    });
    return unsubRegs;
  }, [user]);

  const login = () => signInWithPopup(auth, googleProvider);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 text-center">
        <div className="bg-white p-12 rounded-3xl shadow-xl max-w-md w-full border border-gray-100">
          <LayoutDashboard size={48} className="mx-auto mb-6 text-rose-600" />
          <h2 className="text-2xl font-bold mb-2">Painel Administrativo</h2>
          <p className="text-gray-500 mb-8 lowercase">Acesso exclusivo para organizadores autorizados.</p>
          <button 
            onClick={login}
            className="w-full bg-gray-900 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-gray-800 transition-all shadow-lg"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" height="20" alt="" />
            Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar isAdmin={true} />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
             <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Total Arrecadado</div>
             <div className="text-4xl font-black text-rose-600">R$ {stats.total.toLocaleString('pt-BR')},00</div>
          </div>
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
             <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Inscrições Pagas</div>
             <div className="text-4xl font-black text-gray-900">{stats.count}</div>
          </div>
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
             <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Taxa Conversão</div>
             <div className="text-4xl font-black text-gray-900">
               {regs.length > 0 ? Math.round((stats.count / regs.length) * 100) : 0}%
             </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm overflow-hidden border border-gray-100">
          <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
            <h3 className="font-bold text-gray-800">Inscrições Recentes</h3>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{regs.length} cadastros</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4">Nome</th>
                  <th className="px-6 py-4">Contato</th>
                  <th className="px-6 py-4">Valor</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {regs.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-all cursor-default">
                    <td className="px-6 py-5 font-bold text-gray-800">{r.name}</td>
                    <td className="px-6 py-5">
                      <div className="text-sm text-gray-900">{r.email}</div>
                      <div className="text-xs text-gray-400">{r.phone}</div>
                    </td>
                    <td className="px-6 py-5 font-mono text-sm">R$ {r.amount},00</td>
                    <td className="px-6 py-5">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        r.status === 'approved' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {r.status === 'approved' ? 'Pago' : 'Pendente'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right text-xs text-gray-400">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
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
