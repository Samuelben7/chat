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
    frontend_url: str = "https://yoursystem.dev.br"
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
