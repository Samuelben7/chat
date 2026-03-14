"""
Gerador de Contrato PDF para YourSystem.
Gerado ao assinar um plano. Bonito, azul marinho, com logo e limites claros.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from datetime import datetime
import io
import os

from app.database.database import get_db
from app.models.models import Assinatura, Empresa, Plano
from app.core.dependencies import EmpresaIdFromToken

router = APIRouter(prefix="/empresa/contrato", tags=["contrato"])

# Cores YourSystem
NAVY = (0.094, 0.224, 0.373)        # #183960
BLUE = (0.294, 0.482, 0.925)        # #4B7BEC
LIGHT_BLUE = (0.85, 0.91, 1.0)
WHITE = (1, 1, 1)
GRAY = (0.55, 0.55, 0.65)
DARK = (0.1, 0.1, 0.15)
GREEN = (0.133, 0.773, 0.369)

CNPJ = "64.699.504/0001-24"
EMPRESA_NOME = "YourSystem Tecnologia"
LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "static", "logo.png")


def _fmt_brl(valor) -> str:
    try:
        return f"R$ {float(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return str(valor)


def _fmt_date(dt) -> str:
    if dt:
        return dt.strftime("%d/%m/%Y")
    return "-"


def _gerar_pdf(empresa: Empresa, assinatura: Assinatura) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
    from reportlab.lib.colors import HexColor

    W, H = A4
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    def rgb(r, g, b):
        return (r, g, b)

    def set_fill(color):
        c.setFillColorRGB(*color)

    def set_stroke(color):
        c.setStrokeColorRGB(*color)

    # ── HEADER BACKGROUND ──────────────────────────────────────
    set_fill(NAVY)
    c.rect(0, H - 120, W, 120, fill=1, stroke=0)

    # Logo (se existir)
    if os.path.exists(LOGO_PATH):
        try:
            img = ImageReader(LOGO_PATH)
            c.drawImage(img, 40, H - 100, width=60, height=60, preserveAspectRatio=True, mask='auto')
        except Exception:
            pass

    # Nome da empresa no header
    set_fill(WHITE)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(115, H - 55, "YourSystem")
    c.setFont("Helvetica", 11)
    set_fill((0.7, 0.82, 1.0))
    c.drawString(115, H - 72, "Plataforma de Atendimento via WhatsApp")

    # CNPJ no header direito
    set_fill(LIGHT_BLUE)
    c.setFont("Helvetica", 9)
    c.drawRightString(W - 40, H - 50, f"CNPJ: {CNPJ}")
    c.drawRightString(W - 40, H - 63, "yoursystem.dev.br")

    # ── TÍTULO DO CONTRATO ──────────────────────────────────────
    set_fill(NAVY)
    c.rect(40, H - 155, W - 80, 25, fill=1, stroke=0)
    set_fill(WHITE)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(W / 2, H - 146, "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE TECNOLOGIA")

    # ── PARTES ─────────────────────────────────────────────────
    y = H - 185
    set_fill(DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, y, "PARTES CONTRATANTES")
    y -= 5

    set_fill(BLUE)
    c.rect(40, y - 3, W - 80, 1.5, fill=1, stroke=0)
    y -= 20

    set_fill(DARK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "CONTRATADA:")
    c.setFont("Helvetica", 10)
    c.drawString(120, y, f"{EMPRESA_NOME} — CNPJ {CNPJ}")
    y -= 16

    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "CONTRATANTE:")
    c.setFont("Helvetica", 10)
    nome_emp = empresa.nome or "-"
    cnpj_emp = empresa.cnpj or "Não informado"
    c.drawString(120, y, f"{nome_emp} — CNPJ/CPF: {cnpj_emp}")
    y -= 16

    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "E-mail:")
    c.setFont("Helvetica", 10)
    c.drawString(120, y, empresa.admin_email or "-")
    y -= 30

    # ── OBJETO ─────────────────────────────────────────────────
    set_fill(DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, y, "OBJETO DO CONTRATO")
    y -= 5
    set_fill(BLUE)
    c.rect(40, y - 3, W - 80, 1.5, fill=1, stroke=0)
    y -= 18

    set_fill(DARK)
    c.setFont("Helvetica", 10)
    objeto = (
        "A CONTRATADA se compromete a disponibilizar acesso à plataforma YourSystem, solução SaaS "
        "para atendimento ao cliente via WhatsApp, nos termos e limites do plano contratado abaixo."
    )
    _draw_wrapped(c, objeto, 40, y, W - 80, 12)
    y -= 40

    # ── PLANO CONTRATADO ────────────────────────────────────────
    plano = assinatura.plano
    is_custom = assinatura.is_personalizado

    plano_nome = (assinatura.plano_personalizado_nome if is_custom else (plano.nome if plano else "-"))
    preco = float(assinatura.preco_personalizado if is_custom and assinatura.preco_personalizado else (plano.preco_mensal if plano else 0))
    limites = assinatura.limites_personalizados if is_custom and assinatura.limites_personalizados else (plano.limites if plano else {})

    conversas_mes = limites.get("conversas_mes", limites.get("mensagens_mes", "Ilimitado"))
    ia_conversas = limites.get("ia_conversas", "Conforme plano")
    max_atendentes = limites.get("max_atendentes", limites.get("atendentes", "Conforme plano"))

    set_fill(DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, y, "PLANO CONTRATADO")
    y -= 5
    set_fill(BLUE)
    c.rect(40, y - 3, W - 80, 1.5, fill=1, stroke=0)
    y -= 18

    # Card do plano
    set_fill(LIGHT_BLUE)
    c.roundRect(40, y - 110, W - 80, 115, 8, fill=1, stroke=0)
    set_fill(BLUE)
    c.roundRect(40, y - 110, W - 80, 115, 8, fill=0, stroke=1)

    set_fill(NAVY)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(60, y - 25, f"Plano {plano_nome}")

    set_fill(GREEN)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(60, y - 50, _fmt_brl(preco))
    set_fill(GRAY)
    c.setFont("Helvetica", 10)
    c.drawString(60 + len(_fmt_brl(preco)) * 7.5 + 8, y - 50, "/mês")

    # Limites
    set_fill(DARK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(60, y - 72, "LIMITES INCLUÍDOS:")

    c.setFont("Helvetica", 9)
    lim_items = [
        f"Conversas/mês: {conversas_mes:,}".replace(",", ".") if isinstance(conversas_mes, int) else f"Conversas/mês: {conversas_mes}",
        f"Conversas com IA/mês: {ia_conversas:,}".replace(",", ".") if isinstance(ia_conversas, int) else f"Conversas com IA/mês: {ia_conversas}",
        f"Atendentes simultâneos: {max_atendentes}",
    ]
    x_lim = 60
    for item in lim_items:
        c.drawString(x_lim, y - 85, f"• {item}")
        x_lim += (W - 120) / 3

    y -= 125

    # ── VIGÊNCIA E PAGAMENTO ─────────────────────────────────────
    set_fill(DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, y, "VIGÊNCIA E PAGAMENTO")
    y -= 5
    set_fill(BLUE)
    c.rect(40, y - 3, W - 80, 1.5, fill=1, stroke=0)
    y -= 20

    set_fill(DARK)
    c.setFont("Helvetica", 10)
    venc = _fmt_date(assinatura.data_proximo_vencimento)
    inicio = _fmt_date(assinatura.data_inicio)

    c.drawString(40, y, f"• Início: {inicio}    Próximo vencimento: {venc}")
    y -= 16
    c.drawString(40, y, f"• Renovação automática mensal. Cancelamento a qualquer momento sem multa.")
    y -= 16
    c.drawString(40, y, f"• Cobranças excedentes: conversas e IA acima do limite serão cobradas proporcionalmente.")
    y -= 30

    # ── CLÁUSULAS ───────────────────────────────────────────────
    set_fill(DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, y, "CLÁUSULAS GERAIS")
    y -= 5
    set_fill(BLUE)
    c.rect(40, y - 3, W - 80, 1.5, fill=1, stroke=0)
    y -= 18

    clausulas = [
        "1. Os dados tratados pela plataforma são de responsabilidade do CONTRATANTE, nos termos da LGPD.",
        "2. A CONTRATADA garante disponibilidade de 99,5% ao mês, exceto manutenções programadas.",
        "3. O acesso à plataforma poderá ser suspenso em caso de inadimplência superior a 15 dias.",
        "4. As partes elegem o foro da comarca de Teresina-PI para dirimir eventuais conflitos.",
    ]
    set_fill(DARK)
    c.setFont("Helvetica", 9)
    for cl in clausulas:
        _draw_wrapped(c, cl, 40, y, W - 80, 11)
        y -= 26

    y -= 10

    # ── ASSINATURAS ─────────────────────────────────────────────
    set_fill(NAVY)
    c.rect(0, 0, W, y - 10, fill=1, stroke=0)

    set_fill(WHITE)
    c.setFont("Helvetica", 9)
    sig_y = y - 35

    # Linha assinatura contratada
    set_fill((0.4, 0.6, 0.9))
    c.rect(60, sig_y - 2, 160, 1, fill=1, stroke=0)
    c.rect(W - 220, sig_y - 2, 160, 1, fill=1, stroke=0)

    set_fill(WHITE)
    c.drawCentredString(140, sig_y - 14, EMPRESA_NOME)
    c.drawCentredString(140, sig_y - 24, f"CNPJ: {CNPJ}")
    c.drawCentredString(W - 140, sig_y - 14, nome_emp[:40])
    c.drawCentredString(W - 140, sig_y - 24, "CONTRATANTE")

    # Data
    c.setFont("Helvetica", 8)
    set_fill((0.6, 0.75, 0.9))
    c.drawCentredString(W / 2, 20, f"Gerado em {datetime.now().strftime('%d/%m/%Y às %H:%M')}  •  yoursystem.dev.br")

    c.showPage()
    c.save()
    return buf.getvalue()


def _draw_wrapped(c, text: str, x: float, y: float, max_width: float, line_height: float):
    """Quebra texto em linhas respeitando max_width."""
    from reportlab.pdfbase.pdfmetrics import stringWidth
    words = text.split()
    line = ""
    for word in words:
        test = f"{line} {word}".strip()
        if stringWidth(test, "Helvetica", 10) < max_width:
            line = test
        else:
            c.drawString(x, y, line)
            y -= line_height
            line = word
    if line:
        c.drawString(x, y, line)


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("")
async def gerar_contrato(
    empresa_id: EmpresaIdFromToken,
    db: Session = Depends(get_db),
):
    """Gera e retorna o contrato em PDF para a empresa logada."""
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")

    assinatura = db.query(Assinatura).filter(
        Assinatura.empresa_id == empresa_id,
        Assinatura.status.in_(["active", "overdue"])
    ).order_by(Assinatura.data_inicio.desc()).first()

    if not assinatura:
        raise HTTPException(status_code=404, detail="Nenhuma assinatura ativa para gerar contrato")

    try:
        pdf_bytes = _gerar_pdf(empresa, assinatura)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar PDF: {str(e)}")

    nome_arquivo = f"contrato_yoursystem_{empresa.nome.replace(' ', '_')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nome_arquivo}"'},
    )
