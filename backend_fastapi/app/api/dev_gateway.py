"""
Endpoint interno de validacao de token para Nginx auth_request.
Critico para performance do API Gateway.
"""
from fastapi import APIRouter, HTTPException, Header, Depends, Response
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import bcrypt
import json
import logging
import time

from app.database.database import get_db
from app.models.models import ApiKey, DevUsuario, Assinatura, GatewayLog
from app.core.config import settings
from app.core.redis_client import redis_cache

logger = logging.getLogger("gateway")

router = APIRouter(prefix="/internal", tags=["dev-gateway-internal"])

# Cache TTL para validacao de API key (evita bcrypt em cada request)
CACHE_TTL = 60  # 60 segundos


@router.get("/validar-token")
async def validar_token(
    response: Response,
    x_api_key: str = Header(None, alias="X-Api-Key"),
    x_original_uri: str = Header(None, alias="X-Original-URI"),
    x_original_method: str = Header(None, alias="X-Original-Method"),
    db: Session = Depends(get_db),
):
    """
    Endpoint chamado pelo Nginx auth_request para validar API key.
    Retorna headers com Meta token e phone_number_id para o proxy.
    """
    start_time = time.time()

    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-Api-Key header required")

    # 1. Tentar cache Redis primeiro
    cache_key = f"gateway:apikey:{x_api_key[:8]}"
    cached = redis_cache.client.get(cache_key)

    dev_id = None
    api_key_id = None

    if cached:
        try:
            data = json.loads(cached)
            # Validar que a key cached bate com a key enviada
            if data.get("key_match"):
                dev_id = data["dev_id"]
                api_key_id = data["api_key_id"]
        except (json.JSONDecodeError, KeyError):
            pass

    if dev_id is None:
        # 2. Buscar por prefix no DB
        prefix = x_api_key[:8]
        keys = db.query(ApiKey).filter(
            ApiKey.key_prefix == prefix,
            ApiKey.ativa == True
        ).all()

        if not keys:
            raise HTTPException(status_code=401, detail="Invalid API key")

        # 3. Comparar hash bcrypt
        matched_key = None
        for key in keys:
            if bcrypt.checkpw(x_api_key.encode('utf-8'), key.key_hash.encode('utf-8')):
                matched_key = key
                break

        if not matched_key:
            raise HTTPException(status_code=401, detail="Invalid API key")

        dev_id = matched_key.dev_id
        api_key_id = matched_key.id

        # Atualizar ultima utilizacao
        matched_key.ultima_utilizacao = datetime.now(timezone.utc)
        db.commit()

        # 4. Cache no Redis
        redis_cache.client.setex(
            cache_key,
            CACHE_TTL,
            json.dumps({
                "dev_id": dev_id,
                "api_key_id": api_key_id,
                "key_match": True,
            })
        )

    # 5. Buscar dev e verificar status
    dev = db.query(DevUsuario).filter(DevUsuario.id == dev_id).first()
    if not dev or not dev.ativo:
        raise HTTPException(status_code=403, detail="Account disabled")

    # Verificar status (trial ou assinatura ativa)
    if dev.status == "blocked":
        raise HTTPException(status_code=403, detail="Account blocked. Please renew your subscription.")

    if dev.status == "trial":
        if dev.trial_fim and dev.trial_fim < datetime.now(timezone.utc):
            raise HTTPException(status_code=403, detail="Trial expired. Please subscribe to continue.")

    # 6. Rate limiting (Redis sliding window)
    now = time.time()
    rate_key = f"gateway:rate:{dev_id}"
    pipe = redis_cache.client.pipeline()
    pipe.zremrangebyscore(rate_key, 0, now - 60)  # remover entries > 1min
    pipe.zadd(rate_key, {f"{now}": now})
    pipe.zcard(rate_key)
    pipe.expire(rate_key, 120)
    results = pipe.execute()
    request_count = results[2]

    # Buscar limite do plano ou usar padrao
    rate_limit = settings.GATEWAY_RATE_LIMIT_PER_MIN
    assinatura = db.query(Assinatura).filter(
        Assinatura.dev_id == dev_id,
        Assinatura.status == "active"
    ).first()
    if assinatura and assinatura.plano and assinatura.plano.limites:
        rate_limit = assinatura.plano.limites.get("requests_min", rate_limit)

    if request_count > rate_limit:
        response.headers["Retry-After"] = "60"
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    # 7. Verificar limite mensal de mensagens
    month_key = f"gateway:msgs:{dev_id}:{datetime.now(timezone.utc).strftime('%Y-%m')}"
    monthly_count = int(redis_cache.client.get(month_key) or 0)

    # Limite dinamico: WABA real (Meta) > plano > padrao
    msg_limit = settings.GATEWAY_MESSAGES_PER_MONTH
    if assinatura and assinatura.plano and assinatura.plano.limites:
        msg_limit = assinatura.plano.limites.get("mensagens_mes", msg_limit)

    # Verificar se tem limite WABA real (atualizado semanalmente pela task)
    waba_limit_raw = redis_cache.client.get(f"waba:limit:dev:{dev_id}")
    if waba_limit_raw:
        try:
            waba_data = json.loads(waba_limit_raw)
            waba_limit = waba_data.get("limit", 0)
            if waba_limit > 0:
                msg_limit = waba_limit  # usar limite real da Meta
        except (json.JSONDecodeError, KeyError):
            pass

    if monthly_count >= msg_limit:
        raise HTTPException(status_code=429, detail="Monthly message limit exceeded")

    # 8. Verificar que dev tem WhatsApp conectado
    if not dev.whatsapp_token or not dev.phone_number_id:
        raise HTTPException(status_code=403, detail="WhatsApp not connected")

    # 9. Incrementar contador mensal
    pipe = redis_cache.client.pipeline()
    pipe.incr(month_key)
    pipe.expire(month_key, 86400 * 35)  # expira em 35 dias
    pipe.execute()

    # 10. Log assíncrono (não bloqueia a resposta)
    latency = int((time.time() - start_time) * 1000)
    try:
        log = GatewayLog(
            dev_id=dev_id,
            api_key_id=api_key_id,
            endpoint=x_original_uri or "/gateway/messages",
            status_code=200,
            latency_ms=latency,
        )
        db.add(log)
        db.commit()
    except Exception as e:
        logger.warning(f"Failed to log gateway request: {e}")

    # 11. Retornar headers para Nginx
    response.headers["X-Meta-Token"] = dev.whatsapp_token
    response.headers["X-Phone-Number-Id"] = dev.phone_number_id
    response.headers["X-Dev-Id"] = str(dev_id)

    return {"status": "ok"}
