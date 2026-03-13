import React, { useEffect, useState, useCallback } from 'react';
import { 
  FaStar, FaHeart, FaGift, FaMapMarkerAlt, FaCalendarAlt, FaClock, 
  FaCrown, FaPhone, FaEnvelope, FaTshirt, FaWalking, FaGem, FaCheck, 
  FaExternalLinkAlt, FaUsers, FaTimes, FaSpinner
} from 'react-icons/fa';
import api from '../services/api';

// DADOS REAIS DO EVENTO
const EVENT_DATE = new Date('2026-04-25T19:00:00');
const PHONE_NUMBER = '+5575988080555';
const EMAIL = 'glauiaamdrade@gmail.com';
const MAPS_LINK = 'https://share.google/SrEXfZGL6tNXevQy9';
const VENUE_NAME = 'Onix Eventos - Feira de Santana';
const ADMIN_CLICKS = 5;

interface TimeLeft { days: number; hours: number; minutes: number; seconds: number }
interface GiftItem { id: string; name: string; size?: string; note?: string; reserved?: boolean; reservedBy?: string }
interface GiftCategory { icon: React.ReactNode; title: string; gradient: string; items: GiftItem[] }
interface Guest { name: string; confirmedAt: string }

function useCountdown(target: Date): TimeLeft {
  const [time, setTime] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  useEffect(() => {
    const calc = () => {
      const diff = target.getTime() - Date.now();
      if (diff > 0) setTime({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff / 3600000) % 24),
        minutes: Math.floor((diff / 60000) % 60),
        seconds: Math.floor((diff / 1000) % 60)
      });
    };
    calc();
    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, [target]);
  return time;
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative bg-white/10 backdrop-blur-md rounded-xl md:rounded-2xl p-3 md:p-6 border border-white/20 shadow-xl min-w-[65px] md:min-w-[100px]">
        <span className="text-2xl md:text-5xl font-bold text-white">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="text-[10px] md:text-sm text-purple-200 mt-2 uppercase tracking-widest font-medium">{label}</span>
    </div>
  );
}

const ConviteAniversario: React.FC = () => {
  const timeLeft = useCountdown(EVENT_DATE);
  const [gifts, setGifts] = useState<GiftCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalGift, setModalGift] = useState<GiftItem | null>(null);
  const [reserving, setReserving] = useState(false);
  const [showRSVP, setShowRSVP] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [rsvpSuccess, setRsvpSuccess] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);

  const defaultGifts: GiftCategory[] = [
    { icon: <FaTshirt className="w-6 h-6 text-purple-200" />, title: 'Roupas', gradient: 'from-purple-600/80 to-purple-800/80',
      items: [{ id: 'r1', name: 'Shorts jeans/básico', size: '38' }, { id: 'r2', name: 'Saias' }, { id: 'r3', name: 'Roupas de academia sem estampa' }, { id: 'r4', name: 'Calças cargo', size: '40' }, { id: 'r5', name: 'Vestidos', size: 'G' }, { id: 'r6', name: 'Blusas largas', size: 'G' }, { id: 'r7', name: 'Blusas Top', size: 'M' }, { id: 'r8', name: 'Biquíni', size: 'G' }, { id: 'r9', name: 'Maiô', size: 'G', note: 'Sem estampa' }] },
    { icon: <FaWalking className="w-6 h-6 text-purple-200" />, title: 'Calçados', gradient: 'from-violet-600/80 to-violet-800/80',
      items: [{ id: 'c1', name: 'Sapatos/Crocs/Sandálias/Papete', size: '37/38' }, { id: 'c2', name: 'Tênis' }] },
    { icon: <FaStar className="w-6 h-6 text-purple-200" />, title: 'Beleza', gradient: 'from-fuchsia-600/80 to-fuchsia-800/80',
      items: [{ id: 'b1', name: 'Produtos de skincare' }, { id: 'b2', name: 'Perfumes madeirados/Body splash' }, { id: 'b3', name: 'Maquiagens', note: 'paleta de sombras, esponjas, gloss, removedor, pó, pincéis' }] },
    { icon: <FaGem className="w-6 h-6 text-purple-200" />, title: 'Acessórios', gradient: 'from-purple-700/80 to-violet-900/80',
      items: [{ id: 'a1', name: 'Anéis', size: '17' }, { id: 'a2', name: 'Pulseiras, braceletes' }, { id: 'a3', name: 'Cintos de corrente' }, { id: 'a4', name: 'Colares', note: 'dourados' }, { id: 'a5', name: 'Fone' }, { id: 'a6', name: 'Bolsas de costas de couro', note: 'pretas, brancas ou marrons' }] }
  ];

  const loadGifts = useCallback(async () => {
    try {
      const res = await api.get('/niver-sobrinha/gifts');
      const data = res.data;
      if (data.reserved) {
        setGifts(defaultGifts.map(cat => ({
          ...cat,
          items: cat.items.map(item => ({
            ...item,
            reserved: data.reserved[item.id]?.reserved || false,
            reservedBy: data.reserved[item.id]?.reservedBy
          }))
        })));
      } else {
        setGifts(defaultGifts);
      }
    } catch (err) {
      console.error("Erro ao carregar presentes:", err);
      setGifts(defaultGifts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGifts(); }, [loadGifts]);

  const handleReserve = async (giftId: string, name: string) => {
    if (!name.trim()) return;
    setReserving(true);
    try {
      await api.post('/niver-sobrinha/gifts', { giftId, name, action: 'reserve' });
      setGifts(prev => prev.map(cat => ({
        ...cat,
        items: cat.items.map(item => item.id === giftId ? { ...item, reserved: true, reservedBy: name } : item)
      })));
      setModalGift(null);
      alert("Presente marcado com sucesso! Obrigado! 🎁");
    } catch (err: any) {
      console.error("Erro ao reservar:", err);
      alert(err.response?.data?.detail || "Erro ao conectar com o servidor.");
    } finally {
      setReserving(false);
    }
  };

  const handleRSVP = async (name: string) => {
    if (!name.trim()) return;
    setRsvpLoading(true);
    try {
      await api.post('/niver-sobrinha/guests', { name });
      setShowRSVP(false);
      setRsvpSuccess(true);
      setTimeout(() => setRsvpSuccess(false), 5000);
    } catch (err: any) {
      console.error("Erro no RSVP:", err);
      alert("Erro ao confirmar presença. Tente novamente.");
    } finally {
      setRsvpLoading(false);
    }
  };

  const [lastClickTime, setLastClickTime] = useState(0);

  const handleAdminClick = async () => {
    const now = Date.now();
    const isQuickClick = now - lastClickTime < 1000; // cliques com intervalo de até 1s
    
    let count = isQuickClick ? clickCount + 1 : 1;
    setClickCount(count);
    setLastClickTime(now);

    if (count >= ADMIN_CLICKS) {
      setClickCount(0);
      setShowAdmin(true);
      setAdminLoading(true);
      try {
        const res = await api.get('/niver-sobrinha/guests');
        setGuests(res.data.guests || []);
      } catch (err) {
        console.error("Erro admin:", err);
      } finally {
        setAdminLoading(false);
      }
    }
  };

  const whatsapp = `https://wa.me/${PHONE_NUMBER.replace(/\+/g, '')}?text=${encodeURIComponent('Olá! Confirmar presença festa 15 anos! 🎉')}`;

  return (
    <main className="min-h-screen bg-[#1a0a2e] text-white overflow-x-hidden font-sans">
      <style>{`
        @keyframes fadeReveal {
          0% { opacity: 0; transform: translateY(20px); filter: blur(10px); }
          100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .animate-reveal {
          animation: fadeReveal 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .delay-1 { animation-delay: 0.5s; opacity: 0; }
      `}</style>
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/50 via-transparent to-[#1a0a2e] z-10" />
        <div className="absolute inset-0">
          <img src="/cover.jpg" alt="Aniversariante" className="w-full h-full object-cover object-top" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a0a2e] via-purple-900/40 to-transparent" />
        </div>
        <div className="relative z-20 text-center px-4 max-w-4xl mx-auto">
          <div className="mb-6">
            <FaCrown className="w-12 h-12 md:w-16 md:h-16 mx-auto text-purple-300 mb-4 cursor-pointer hover:text-purple-200" onClick={handleAdminClick} />
          </div>
          <div className="mb-4">
            <span className="inline-block px-4 py-1.5 md:px-6 md:py-2 bg-purple-500/30 rounded-full border border-purple-400/30">
              <p className="text-xs md:text-base text-purple-200 tracking-widest uppercase">Você está convidado para</p>
            </span>
          </div>
          <h1 className="text-5xl md:text-8xl lg:text-9xl font-bold mb-4 bg-gradient-to-r from-purple-200 via-white to-purple-200 bg-clip-text text-transparent italic animate-reveal" style={{ fontFamily: 'serif' }}>
            15 Anos
          </h1>
          <div className="mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="h-px w-8 md:w-24 bg-gradient-to-r from-transparent to-purple-400" />
              <FaStar className="w-4 h-4 md:w-5 md:h-5 text-purple-300" />
              <div className="h-px w-8 md:w-24 bg-gradient-to-l from-transparent to-purple-400" />
            </div>
            <h2 className="text-xl md:text-4xl italic text-purple-100 animate-reveal delay-1">A Celebrar 15 Anos de Sonhos</h2>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 text-purple-200">
            <div className="flex items-center gap-2 font-medium"><FaCalendarAlt className="w-5 h-5" /><span className="text-base md:text-lg">25 de Abril de 2026</span></div>
            <div className="hidden md:block w-1 h-1 bg-purple-400 rounded-full" />
            <div className="flex items-center gap-2 font-medium"><FaClock className="w-5 h-5" /><span className="text-base md:text-lg">19:00</span></div>
          </div>
          <div className="mt-8">
            <a href={MAPS_LINK} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 md:px-6 md:py-3 bg-white/10 backdrop-blur-md rounded-full border border-purple-400/30 hover:bg-white/20 transition-all text-sm md:text-base">
              <FaMapMarkerAlt className="w-4 h-4 text-purple-300" />
              <span className="text-purple-100">{VENUE_NAME}</span>
              <FaExternalLinkAlt className="w-3 h-3 text-purple-300" />
            </a>
          </div>
        </div>
      </section>

      {/* Countdown */}
      <section className="relative py-12 md:py-20 px-4">
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-5xl text-white mb-2 font-bold italic">Contagem Regressiva</h2>
          <p className="text-purple-200 text-sm md:text-lg mb-8 md:mb-10">Para o grande dia</p>
          <div className="flex justify-center gap-2 md:gap-6">
            <CountdownUnit value={timeLeft.days} label="Dias" />
            <div className="flex items-center text-2xl md:text-4xl text-purple-400 font-light">:</div>
            <CountdownUnit value={timeLeft.hours} label="Horas" />
            <div className="flex items-center text-2xl md:text-4xl text-purple-400 font-light">:</div>
            <CountdownUnit value={timeLeft.minutes} label="Min" />
            <div className="flex items-center text-2xl md:text-4xl text-purple-400 font-light">:</div>
            <CountdownUnit value={timeLeft.seconds} label="Seg" />
          </div>
        </div>
      </section>

      {/* RSVP */}
      <section className="relative py-12 md:py-16 px-4">
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          {rsvpSuccess ? (
            <div className="bg-green-500/20 backdrop-blur-md rounded-3xl p-8 border border-green-400/30">
              <FaCheck className="w-12 h-12 md:w-16 md:h-16 mx-auto text-green-400 mb-4" />
              <h3 className="text-xl md:text-2xl text-white mb-2 font-bold">Presença Confirmada!</h3>
              <p className="text-green-200 text-sm md:text-base">Mal podemos esperar para celebrar com você! 🎉</p>
            </div>
          ) : (
            <div className="bg-white/5 backdrop-blur-md rounded-3xl p-6 md:p-10 border border-white/10 shadow-2xl">
              <FaUsers className="w-10 h-10 md:w-12 md:h-12 mx-auto text-purple-300 mb-4" />
              <h2 className="text-2xl md:text-4xl text-white mb-4 font-bold italic">Confirme sua Presença</h2>
              <p className="text-purple-100 mb-6 text-sm md:text-base">Estamos ansiosos para celebrar este momento especial com você!</p>
              <button onClick={() => setShowRSVP(true)} className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-green-600 to-green-500 rounded-full text-white font-bold hover:scale-105 transition-all shadow-lg flex items-center justify-center gap-2 mx-auto">
                <FaCheck className="w-5 h-5" /> Confirmar Agora
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Gifts */}
      <section className="relative py-12 md:py-20 px-4">
        <div className="relative z-10 max-w-6xl mx-auto">
          <FaGift className="w-10 h-10 md:w-12 md:h-12 mx-auto text-purple-300 mb-4" />
          <h2 className="text-2xl md:text-5xl text-white mb-2 text-center font-bold italic">Lista de Desejos</h2>
          <p className="text-purple-200 text-sm md:text-lg max-w-xl mx-auto text-center mb-8 md:mb-12 px-4">Se quiser me presentear, aqui estão algumas sugestões que vão me deixar muito feliz!</p>
          {loading ? (
            <div className="flex justify-center py-20"><FaSpinner className="w-8 h-8 text-purple-400 animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {gifts.map((cat) => (
                <div key={cat.title} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${cat.gradient} p-5 md:p-6 shadow-xl border border-white/10`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/10 rounded-xl">{cat.icon}</div>
                      <h3 className="text-lg md:text-xl font-bold text-white">{cat.title}</h3>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {cat.items.map((item) => (
                      <li key={item.id} onClick={() => !item.reserved && setModalGift(item)}
                        className={`relative flex items-start gap-2 p-2.5 rounded-lg transition-all ${item.reserved ? 'bg-black/20 opacity-80' : 'hover:bg-white/10 cursor-pointer group'}`}>
                        {item.reserved ? (
                          <>
                            <FaCheck className="w-3 h-3 mt-1.5 text-green-400 flex-shrink-0" />
                            <div className="flex flex-col">
                              <span className="text-white/50 line-through text-sm">{item.name} {item.size && `(${item.size})`}</span>
                              {item.reservedBy && <span className="text-[10px] text-green-400 font-bold uppercase">Reservado por: {item.reservedBy}</span>}
                            </div>
                          </>
                        ) : (
                          <>
                            <FaHeart className="w-3 h-3 mt-1.5 text-purple-200 flex-shrink-0 group-hover:scale-125 transition-transform" />
                            <span className="text-white/90 text-sm md:text-base">{item.name} {item.size && `(${item.size})`}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-12 md:py-16 px-4 text-center">
        <FaCrown className="w-12 h-12 mx-auto text-purple-300 mb-6" />
        <h3 className="text-xl md:text-2xl text-white mb-8 font-bold px-4">Obrigada por fazer parte deste momento especial!</h3>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-green-600 rounded-full font-bold hover:bg-green-500 transition-all">
            <FaPhone className="w-4 h-4" /><span>WhatsApp</span>
          </a>
          <a href={`mailto:${EMAIL}`} className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-white/10 rounded-full font-bold hover:bg-white/20 transition-all border border-white/20">
            <FaEnvelope className="w-4 h-4" /><span>E-mail</span>
          </a>
        </div>
        <p className="text-purple-400 text-[10px] mt-12 uppercase tracking-widest">25 de Abril de 2026 • {VENUE_NAME}</p>
      </footer>

      {/* Modals */}
      {modalGift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setModalGift(null)}>
          <div className="bg-[#2d1b4e] rounded-2xl p-6 md:p-8 max-w-md w-full border border-purple-500/30 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-4 italic">Reservar Sugestão</h3>
            <p className="text-purple-200 text-sm mb-2">Você escolheu o presente:</p>
            <p className="text-white font-bold mb-6 bg-white/10 rounded-lg p-4 border border-white/10">{modalGift.name}</p>
            <form onSubmit={e => { e.preventDefault(); const name = (e.target as any).nombre.value; handleReserve(modalGift.id, name) }}>
              <label className="text-xs text-purple-300 uppercase font-bold mb-2 block">Seu Nome Completo</label>
              <input name="nombre" placeholder="Ex: Maria Oliveira" className="w-full px-4 py-4 rounded-xl bg-white/5 border border-purple-400/30 text-white mb-6 outline-none focus:border-purple-400 transition-all" required autoFocus />
              <div className="flex gap-3">
                <button type="button" onClick={() => setModalGift(null)} className="flex-1 px-4 py-3 rounded-xl bg-white/5 text-white font-bold">Voltar</button>
                <button type="submit" disabled={reserving} className="flex-1 px-4 py-3 rounded-xl bg-purple-600 text-white font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-purple-500 transition-all">
                  {reserving ? <FaSpinner className="animate-spin" /> : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRSVP && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowRSVP(false)}>
          <div className="bg-[#2d1b4e] rounded-2xl p-6 md:p-8 max-w-md w-full border border-purple-500/30 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white italic">Confirmar Presença</h3>
              <button onClick={() => setShowRSVP(false)} className="text-purple-300 hover:text-white"><FaTimes size={20} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); const name = (e.target as any).nombre.value; handleRSVP(name) }}>
              <label className="text-xs text-purple-300 uppercase font-bold mb-2 block">Nome dos Convidados</label>
              <input name="nombre" placeholder="Ex: Família Silva" className="w-full px-4 py-4 rounded-xl bg-white/5 border border-purple-400/30 text-white mb-6 outline-none focus:border-purple-400 transition-all" required autoFocus />
              <button type="submit" disabled={rsvpLoading} className="w-full px-4 py-4 rounded-xl bg-green-600 text-white font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-green-500 transition-all">
                {rsvpLoading ? <FaSpinner className="animate-spin" /> : 'Confirmar Presença'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md" onClick={() => setShowAdmin(false)}>
          <div className="bg-[#1a0a2e] rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-hidden border border-purple-500/50 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">Lista de Convidados</h3>
                <p className="text-purple-400 text-xs uppercase tracking-widest">{guests.length} Confirmados</p>
              </div>
              <button onClick={() => setShowAdmin(false)} className="bg-white/10 p-2 rounded-full"><FaTimes /></button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] pr-2 custom-scrollbar">
              {adminLoading ? <FaSpinner className="mx-auto animate-spin text-purple-400" /> : guests.map((g, i) => (
                <div key={i} className="flex items-center justify-between bg-white/5 rounded-xl p-4 mb-2 border border-white/5">
                  <div>
                    <p className="text-white font-bold">{g.name}</p>
                    <p className="text-[10px] text-purple-400">{new Date(g.confirmedAt).toLocaleString('pt-BR')}</p>
                  </div>
                  <span className="bg-green-500/20 text-green-400 text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-tighter">Confirmado</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default ConviteAniversario;
