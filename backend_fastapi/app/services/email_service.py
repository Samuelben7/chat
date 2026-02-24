"""
Serviço de envio de emails
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import secrets
from datetime import datetime, timedelta


def gerar_token_confirmacao() -> str:
    """Gera um token seguro para confirmação de email"""
    return secrets.token_urlsafe(32)


def enviar_email_confirmacao(
    destinatario: str,
    nome_empresa: str,
    token: str,
    frontend_url: str = None
) -> bool:
    """
    Envia email de confirmação para nova empresa

    Args:
        destinatario: Email da empresa
        nome_empresa: Nome da empresa
        token: Token de confirmação
        frontend_url: URL do frontend para link de confirmação

    Returns:
        bool: True se enviou com sucesso
    """
    try:
        # Usar FRONTEND_URL do settings se não fornecido
        if not frontend_url:
            from app.core.config import settings
            frontend_url = settings.FRONTEND_URL or "http://localhost:3000"

        # Link de confirmação
        link_confirmacao = f"{frontend_url}/confirmar-email?token={token}"

        # HTML do email (BONITO com logo)
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * {{
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }}
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                    background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%);
                    padding: 40px 20px;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    background-color: #ffffff;
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    overflow: hidden;
                }}
                .header {{
                    background: linear-gradient(135deg, #00d4ff 0%, #7b2cbf 100%);
                    padding: 50px 30px;
                    text-align: center;
                    position: relative;
                }}
                .logo {{
                    width: 120px;
                    height: 120px;
                    border-radius: 50%;
                    margin: 0 auto 20px;
                    border: 5px solid rgba(255, 255, 255, 0.3);
                    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
                    background-color: #fff;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 48px;
                }}
                .header h1 {{
                    color: white;
                    font-size: 28px;
                    font-weight: 700;
                    margin: 0;
                    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
                }}
                .content {{
                    padding: 50px 40px;
                }}
                .greeting {{
                    font-size: 24px;
                    color: #1a1f3a;
                    font-weight: 700;
                    margin-bottom: 10px;
                }}
                .empresa-name {{
                    font-size: 20px;
                    color: #00d4ff;
                    font-weight: 600;
                    margin-bottom: 30px;
                }}
                .content p {{
                    color: #555;
                    line-height: 1.8;
                    margin-bottom: 20px;
                    font-size: 16px;
                }}
                .content strong {{
                    color: #1a1f3a;
                }}
                .button-container {{
                    text-align: center;
                    margin: 40px 0;
                }}
                .button {{
                    display: inline-block;
                    padding: 18px 50px;
                    background: linear-gradient(135deg, #00d4ff 0%, #7b2cbf 100%);
                    color: white !important;
                    text-decoration: none;
                    border-radius: 10px;
                    font-weight: 700;
                    font-size: 18px;
                    box-shadow: 0 10px 30px rgba(0, 212, 255, 0.3);
                    transition: transform 0.3s ease;
                }}
                .button:hover {{
                    transform: translateY(-2px);
                    box-shadow: 0 15px 40px rgba(0, 212, 255, 0.4);
                }}
                .features {{
                    background-color: #f8f9ff;
                    border-radius: 12px;
                    padding: 30px;
                    margin: 30px 0;
                }}
                .feature-item {{
                    display: flex;
                    align-items: center;
                    margin-bottom: 15px;
                }}
                .feature-icon {{
                    font-size: 24px;
                    margin-right: 15px;
                }}
                .feature-text {{
                    color: #555;
                    font-size: 15px;
                }}
                .link-box {{
                    background-color: #f0f2f5;
                    border-left: 4px solid #00d4ff;
                    padding: 20px;
                    border-radius: 8px;
                    margin: 30px 0;
                }}
                .link-box p {{
                    margin-bottom: 10px;
                    font-size: 14px;
                    color: #666;
                }}
                .link-box a {{
                    color: #00d4ff;
                    word-break: break-all;
                    font-size: 13px;
                }}
                .warning-box {{
                    background-color: #fff8e6;
                    border-left: 4px solid #ffa000;
                    padding: 20px;
                    border-radius: 8px;
                    margin: 30px 0;
                }}
                .warning-box p {{
                    color: #8b6200;
                    font-size: 14px;
                    margin: 0;
                }}
                .footer {{
                    background: linear-gradient(135deg, #1a1f3a 0%, #0a0e27 100%);
                    padding: 40px 30px;
                    text-align: center;
                }}
                .footer p {{
                    color: #b8c1ec;
                    font-size: 14px;
                    margin-bottom: 10px;
                }}
                .footer .developer {{
                    color: #00d4ff;
                    font-weight: 600;
                }}
                @media only screen and (max-width: 600px) {{
                    .content {{
                        padding: 30px 20px;
                    }}
                    .header {{
                        padding: 40px 20px;
                    }}
                    .greeting {{
                        font-size: 20px;
                    }}
                    .empresa-name {{
                        font-size: 18px;
                    }}
                    .button {{
                        padding: 15px 35px;
                        font-size: 16px;
                    }}
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <!-- Header com Logo -->
                <div class="header">
                    <div class="logo">🚀</div>
                    <h1>Bem-vindo ao WhatsApp Sistema!</h1>
                </div>

                <!-- Conteúdo -->
                <div class="content">
                    <div class="greeting">Olá!</div>
                    <div class="empresa-name">{nome_empresa}</div>

                    <p>
                        Seja muito bem-vindo ao <strong>WhatsApp Sistema</strong> - sua plataforma completa
                        de atendimento automatizado via WhatsApp! 🎉
                    </p>

                    <!-- Features -->
                    <div class="features">
                        <div class="feature-item">
                            <span class="feature-icon">✅</span>
                            <span class="feature-text">Atendimento automatizado 24/7</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">💬</span>
                            <span class="feature-text">Chat em tempo real com clientes</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">🤖</span>
                            <span class="feature-text">Bot inteligente personalizável</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">📊</span>
                            <span class="feature-text">Dashboard com métricas completas</span>
                        </div>
                    </div>

                    <p>
                        Para ativar sua conta e começar a usar <strong>todas as funcionalidades</strong>,
                        confirme seu email clicando no botão abaixo:
                    </p>

                    <!-- Botão -->
                    <div class="button-container">
                        <a href="{link_confirmacao}" class="button">
                            🔓 Confirmar Email e Ativar Conta
                        </a>
                    </div>

                    <!-- Link alternativo -->
                    <div class="link-box">
                        <p><strong>Ou copie e cole este link no seu navegador:</strong></p>
                        <a href="{link_confirmacao}">{link_confirmacao}</a>
                    </div>

                    <!-- Aviso -->
                    <div class="warning-box">
                        <p>
                            ⏰ <strong>Importante:</strong> Este link expira em <strong>24 horas</strong>.
                            Confirme seu email o quanto antes para não perder o acesso!
                        </p>
                    </div>
                </div>

                <!-- Footer -->
                <div class="footer">
                    <p>© 2026 <strong>WhatsApp Sistema</strong></p>
                    <p>Desenvolvido com 💙 por <span class="developer">Samuel Benjamin</span></p>
                    <p style="margin-top: 20px; font-size: 12px;">
                        Se você não solicitou este cadastro, ignore este email com segurança.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

        # Enviar email via SMTP (Zoho)
        from app.core.config import settings

        smtp_server = settings.SMTP_SERVER
        smtp_port = settings.SMTP_PORT
        sender_email = settings.SMTP_SENDER_EMAIL
        sender_password = settings.SMTP_PASSWORD

        if not sender_password or not sender_email:
            print("⚠️  SMTP não configurado, enviando modo DEBUG")
            print("=" * 80)
            print("📧 EMAIL DE CONFIRMAÇÃO (DEBUG)")
            print("=" * 80)
            print(f"Para: {destinatario}")
            print(f"Empresa: {nome_empresa}")
            print(f"Link: {link_confirmacao}")
            print(f"Token: {token}")
            print("=" * 80)
            return True

        msg = MIMEMultipart('alternative')
        msg['Subject'] = "🚀 Confirme seu email - WhatsApp Sistema"
        msg['From'] = f"WhatsApp Sistema <{sender_email}>"
        msg['To'] = destinatario

        html_part = MIMEText(html_content, 'html')
        msg.attach(html_part)

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, destinatario, msg.as_string())

        print(f"✅ Email enviado para {destinatario}")
        return True

    except Exception as e:
        print(f"❌ Erro ao enviar email: {e}")
        return False


def enviar_email_admin_notificacao(
    empresa_id: int,
    nome_empresa: str,
    email_empresa: str,
    waba_id: str,
    phone_number_id: str
) -> bool:
    """
    Envia email para o admin (Samuel) notificando sobre nova empresa com WhatsApp conectado.
    """
    try:
        from app.core.config import settings

        admin_email = settings.ADMIN_NOTIFICATION_EMAIL
        if not admin_email:
            print("[WARN] ADMIN_NOTIFICATION_EMAIL não configurado")
            return False

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0e27; padding: 40px 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }}
                .header {{ background: linear-gradient(135deg, #00d4ff 0%, #7b2cbf 100%); padding: 40px 30px; text-align: center; }}
                .header h1 {{ color: white; font-size: 24px; margin: 0; }}
                .header p {{ color: rgba(255,255,255,0.8); font-size: 14px; margin-top: 8px; }}
                .content {{ padding: 40px; }}
                .info-box {{ background: #f8f9ff; border-radius: 12px; padding: 24px; margin: 20px 0; }}
                .info-row {{ display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }}
                .info-row:last-child {{ border-bottom: none; }}
                .info-label {{ font-weight: 600; color: #1a1f3a; font-size: 14px; }}
                .info-value {{ color: #555; font-size: 14px; }}
                .badge {{ display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; }}
                .badge-success {{ background: #dcfce7; color: #166534; }}
                .footer {{ background: linear-gradient(135deg, #1a1f3a 0%, #0a0e27 100%); padding: 30px; text-align: center; }}
                .footer p {{ color: #b8c1ec; font-size: 13px; margin: 0; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Nova Empresa Conectou WhatsApp</h1>
                    <p>Embedded Signup concluido com sucesso</p>
                </div>
                <div class="content">
                    <p style="color: #555; font-size: 16px; line-height: 1.6;">
                        Uma nova empresa completou o fluxo de Embedded Signup e conectou o WhatsApp Business.
                    </p>
                    <div class="info-box">
                        <div class="info-row">
                            <span class="info-label">Empresa ID</span>
                            <span class="info-value">#{empresa_id}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Nome</span>
                            <span class="info-value">{nome_empresa}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Email</span>
                            <span class="info-value">{email_empresa}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">WABA ID</span>
                            <span class="info-value">{waba_id}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Phone Number ID</span>
                            <span class="info-value">{phone_number_id}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Status</span>
                            <span class="badge badge-success">WhatsApp Conectado</span>
                        </div>
                    </div>
                </div>
                <div class="footer">
                    <p>&copy; 2026 WhatsApp Sistema - Painel Admin</p>
                </div>
            </div>
        </body>
        </html>
        """

        smtp_server = settings.SMTP_SERVER
        smtp_port = settings.SMTP_PORT
        sender_email = settings.SMTP_SENDER_EMAIL
        sender_password = settings.SMTP_PASSWORD

        if not sender_password or not sender_email:
            print("[DEBUG] Email admin notificacao:")
            print(f"  Empresa: {nome_empresa} (ID: {empresa_id})")
            print(f"  Email: {email_empresa}")
            print(f"  WABA: {waba_id} | Phone: {phone_number_id}")
            return True

        msg = MIMEMultipart('alternative')
        msg['Subject'] = f"Nova Empresa WhatsApp: {nome_empresa}"
        msg['From'] = f"WhatsApp Sistema <{sender_email}>"
        msg['To'] = admin_email

        html_part = MIMEText(html_content, 'html')
        msg.attach(html_part)

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, admin_email, msg.as_string())

        print(f"[OK] Email admin enviado para {admin_email}")
        return True

    except Exception as e:
        print(f"[ERROR] Erro ao enviar email admin: {e}")
        return False


def enviar_email_lembrete_pagamento(
    destinatario: str,
    nome: str,
    tipo: str,
    dias_restantes: int,
    plano_nome: str,
) -> bool:
    """
    Envia email de lembrete de vencimento de assinatura.

    Args:
        destinatario: Email
        nome: Nome do dev ou empresa
        tipo: 'lembrete' / 'vencimento' / 'ultimo_aviso'
        dias_restantes: Dias ate o bloqueio
        plano_nome: Nome do plano
    """
    try:
        from app.core.config import settings

        titulos = {
            "lembrete": f"Sua assinatura vence em {dias_restantes} dias",
            "vencimento": "Sua assinatura venceu hoje",
            "ultimo_aviso": f"Ultimo aviso: bloqueio em {dias_restantes} dias",
        }
        titulo = titulos.get(tipo, "Aviso sobre sua assinatura")

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: -apple-system, sans-serif; background: #f5f5f5; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #00d4ff 0%, #7b2cbf 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 22px;">{titulo}</h1>
                </div>
                <div style="padding: 40px;">
                    <p style="color: #333; font-size: 16px;">Ola, <strong>{nome}</strong>!</p>
                    <p style="color: #555; font-size: 15px; line-height: 1.6;">
                        {'Sua assinatura do plano <strong>' + plano_nome + '</strong> esta proxima do vencimento.' if tipo == 'lembrete' else ''}
                        {'Sua assinatura do plano <strong>' + plano_nome + '</strong> venceu hoje. Renove para continuar usando.' if tipo == 'vencimento' else ''}
                        {'Este e o ultimo aviso antes do bloqueio da sua conta. Renove agora para evitar interrupcao.' if tipo == 'ultimo_aviso' else ''}
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{settings.FRONTEND_URL}/planos"
                           style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #00d4ff, #7b2cbf);
                                  color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px;">
                            Renovar Assinatura
                        </a>
                    </div>
                </div>
                <div style="background: #1a1f3a; padding: 20px; text-align: center;">
                    <p style="color: #b8c1ec; font-size: 13px; margin: 0;">&copy; 2026 WhatsApp Sistema</p>
                </div>
            </div>
        </body>
        </html>
        """

        smtp_server = settings.SMTP_SERVER
        smtp_port = settings.SMTP_PORT
        sender_email = settings.SMTP_SENDER_EMAIL
        sender_password = settings.SMTP_PASSWORD

        if not sender_password or not sender_email:
            print(f"[DEBUG] Email lembrete: {destinatario} - {titulo}")
            return True

        msg = MIMEMultipart('alternative')
        msg['Subject'] = f"WhatsApp Sistema - {titulo}"
        msg['From'] = f"WhatsApp Sistema <{sender_email}>"
        msg['To'] = destinatario
        msg.attach(MIMEText(html_content, 'html'))

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, destinatario, msg.as_string())

        print(f"[OK] Email lembrete enviado para {destinatario}")
        return True

    except Exception as e:
        print(f"[ERROR] Erro ao enviar email lembrete: {e}")
        return False


def enviar_email_bloqueio(
    destinatario: str,
    nome: str,
    plano_nome: str,
) -> bool:
    """Envia email notificando bloqueio de conta por falta de pagamento."""
    try:
        from app.core.config import settings

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: -apple-system, sans-serif; background: #f5f5f5; padding: 40px 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 22px;">Sua conta foi bloqueada</h1>
                </div>
                <div style="padding: 40px;">
                    <p style="color: #333; font-size: 16px;">Ola, <strong>{nome}</strong>!</p>
                    <p style="color: #555; font-size: 15px; line-height: 1.6;">
                        Sua assinatura do plano <strong>{plano_nome}</strong> nao foi renovada e sua conta foi bloqueada.
                        Para reativar o acesso, realize o pagamento.
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{settings.FRONTEND_URL}/planos"
                           style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #00d4ff, #7b2cbf);
                                  color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px;">
                            Reativar Conta
                        </a>
                    </div>
                </div>
                <div style="background: #1a1f3a; padding: 20px; text-align: center;">
                    <p style="color: #b8c1ec; font-size: 13px; margin: 0;">&copy; 2026 WhatsApp Sistema</p>
                </div>
            </div>
        </body>
        </html>
        """

        smtp_server = settings.SMTP_SERVER
        smtp_port = settings.SMTP_PORT
        sender_email = settings.SMTP_SENDER_EMAIL
        sender_password = settings.SMTP_PASSWORD

        if not sender_password or not sender_email:
            print(f"[DEBUG] Email bloqueio: {destinatario} - {nome}")
            return True

        msg = MIMEMultipart('alternative')
        msg['Subject'] = f"WhatsApp Sistema - Conta bloqueada"
        msg['From'] = f"WhatsApp Sistema <{sender_email}>"
        msg['To'] = destinatario
        msg.attach(MIMEText(html_content, 'html'))

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, destinatario, msg.as_string())

        print(f"[OK] Email bloqueio enviado para {destinatario}")
        return True

    except Exception as e:
        print(f"[ERROR] Erro ao enviar email bloqueio: {e}")
        return False
