#!/bin/bash
# =============================================
# Setup script: Nginx + SSL for api.yoursystem.dev.br
# Run on VPS as root: sudo bash setup_vps_ssl.sh
# =============================================
set -e

DOMAIN="api.yoursystem.dev.br"
EMAIL="contato@yoursystem.dev.br"

echo "=== 1. Installing nginx and certbot ==="
apt update
apt install -y nginx certbot python3-certbot-nginx

echo "=== 2. Deploying nginx config ==="
cat > /etc/nginx/sites-available/$DOMAIN << 'NGINX_CONF'
server {
    listen 80;
    server_name api.yoursystem.dev.br;

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name api.yoursystem.dev.br;

    # SSL (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/api.yoursystem.dev.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yoursystem.dev.br/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Upload limit
    client_max_body_size 20M;

    # WebSocket support for /api/v1/ws
    location /api/v1/ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # All other traffic -> FastAPI
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_CONF

echo "=== 3. Enabling site ==="
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo "=== 4. Testing nginx config ==="
nginx -t

echo "=== 5. Opening firewall ports ==="
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw reload
    echo "UFW rules updated"
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
    echo "firewalld rules updated"
else
    echo "No firewall manager found. Make sure ports 80 and 443 are open."
fi

echo "=== 6. Restarting nginx (needed before certbot) ==="
systemctl restart nginx
systemctl enable nginx

echo "=== 7. Obtaining SSL certificate ==="
echo "NOTE: Make sure DNS for $DOMAIN points to this server BEFORE running certbot."
echo ""
read -p "DNS is configured and pointing to this server? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # First, create a temporary config without SSL for certbot to work
    cat > /etc/nginx/sites-available/$DOMAIN << 'TEMP_CONF'
server {
    listen 80;
    server_name api.yoursystem.dev.br;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
TEMP_CONF
    nginx -t && systemctl reload nginx

    certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL

    echo "=== SSL certificate obtained! ==="
else
    echo "Skipping certbot. Run manually later:"
    echo "  certbot --nginx -d $DOMAIN"
fi

echo ""
echo "=== 8. Restarting Docker containers ==="
echo "Run these commands in your project directory:"
echo "  cd /path/to/whatsapp_system"
echo "  docker compose down"
echo "  docker compose up -d"
echo ""
echo "=== DONE! ==="
echo "Test: curl -I https://$DOMAIN/docs"
echo "Webhook URL for Meta: https://$DOMAIN/api/v1/webhook"
echo "Verify Token: meu_token_secreto_123"
