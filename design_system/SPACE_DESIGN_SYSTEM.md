# Space Design System — Contexto Visual para Refatoração

Baseado no projeto `/home/samuel-benjamim/Chat/space` (análise completa).

---

## 🎨 Background Principal

```css
background: #0a0a0f;

/* Orbs animados */
.orb-violet { background: radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%); }
.orb-cyan   { background: radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 70%); }

/* Grade sutil (opcional) */
background-image:
  linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
background-size: 50px 50px;
```

---

## 🃏 Card / Glassmorphism

```css
.glass-card {
  background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 1rem;            /* 16px */
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}

/* Stat card (destaque) */
.glass-stat {
  background: linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);
  backdrop-filter: blur(40px);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 1.5rem;          /* 24px */
}
```

---

## 🎯 Paleta de Cores

| Nome        | Hex       | Uso                       |
|-------------|-----------|---------------------------|
| Violet      | #8b5cf6   | Primário, ícones, accent   |
| Cyan        | #06b6d4   | Secundário, gráficos       |
| Emerald     | #10b981   | Sucesso, status online     |
| Amber       | #f59e0b   | Atenção, warning           |
| Red         | #ef4444   | Erro, danger               |
| Blue        | #3b82f6   | Info, links                |
| BG Main     | #0a0a0f   | Fundo principal            |
| BG Card     | rgba(255,255,255,0.04) | Cards     |
| Border      | rgba(255,255,255,0.08) | Bordas    |
| Text White  | #f4f4f5   | Texto principal            |
| Text Muted  | #71717a   | Texto secundário (zinc-500)|

---

## ✨ Gradientes Recorrentes

```css
/* Botão primário */
background: linear-gradient(to right, #8b5cf6, #06b6d4);

/* Ícone logo / badge */
background: linear-gradient(135deg, #8b5cf6, #06b6d4);

/* Barra lateral ativa */
background: linear-gradient(to right, rgba(139,92,246,0.2), transparent);

/* Glow effect */
box-shadow: 0 0 20px rgba(139,92,246,0.3);
```

---

## 📐 Tipografia

```css
font-family: 'Inter', -apple-system, sans-serif;
/* (projeto usa Geist, mas Inter é equivalente e já está no sistema) */

/* Escala */
h1: 1.875rem / bold
h2: 1.5rem / semibold
h3: 1.125rem / semibold
body: 0.875rem / normal
small: 0.75rem / normal
xs: 0.625rem / normal
```

---

## 🏗️ Estrutura de Layout (Dashboard)

```
┌─ Sidebar (64px icon-only) ─────────────────────────────────┐
│  Logo (gradient violet→cyan)                                 │
│  Nav icons (ativo: bg violet/10 + barra esquerda gradient)  │
└─────────────────────────────────────────────────────────────┘

┌─ Main Area ─────────────────────────────────────────────────┐
│  Header fixo: title + actions (blur backdrop)               │
│  ─────────────────────────────────────────────────          │
│  Grid Stats (4 col desktop, 2 tablet, 1 mobile)             │
│  [Card] [Card] [Card] [Card]                                │
│  ─────────────────────────────────────────────────          │
│  Grid Content (2/3 + 1/3)                                   │
│  [Gráfico / Tabela principal] | [Lista/Feed lateral]        │
│  ─────────────────────────────────────────────────          │
│  Grid Inferior (full width ou 3 cols)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Recharts — Configuração Padrão

```tsx
// CartesianGrid
<CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />

// Axes
<XAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
<YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />

// Tooltip
contentStyle={{
  background: 'rgba(24,24,27,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  backdropFilter: 'blur(40px)',
}}

// Area gradient
<defs>
  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.3} />
    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
  </linearGradient>
</defs>
```

---

## 🎬 Animações

```css
/* Padrão para cards/seções */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
animation: fadeUp 0.5s ease forwards;
animation-delay: calc(var(--i) * 0.1s);  /* stagger */

/* Hover card */
transform: translateY(-2px);
box-shadow: 0 16px 40px rgba(139,92,246,0.15);

/* Scrollbar */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.4); border-radius: 2px; }
```

---

## 🔖 Status Badges

```tsx
// Online / Sucesso
{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }

// Warning / Atenção
{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }

// Violet / Destaque
{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)' }

// Cyan / Info
{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }
```

---

## 📝 Componentes para replicar de /space

- `/src/components/layout/Sidebar.tsx` → estilo do sidebar ativo
- `/src/app/dashboard/page.tsx` → estrutura do dashboard principal
- Stat cards com shimmer + glow hover
- AreaChart + LineChart com gradientes
- Kanban cards com drag-and-drop glass style
- Chat bubbles com glassmorphism

