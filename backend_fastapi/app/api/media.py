from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import httpx
import subprocess
import tempfile
import os

from app.database.database import get_db
from app.models.models import Empresa, MensagemLog, Atendimento
from app.schemas.schemas import MensagemResponse
from app.services.whatsapp import WhatsAppService

router = APIRouter()

# Mapeamento de mime_type para tipo WhatsApp (somente tipos aceitos pela Meta)
MIME_TO_WA_TYPE = {
    "image/jpeg": "image",
    "image/png": "image",
    "image/gif": "image",
    "image/webp": "image",
    "audio/ogg": "audio",
    "audio/mpeg": "audio",
    "audio/mp4": "audio",
    "audio/aac": "audio",
    "audio/amr": "audio",
    "audio/opus": "audio",
    "video/mp4": "video",
    "video/3gpp": "video",
    "application/pdf": "document",
    "text/plain": "document",
    "application/vnd.ms-excel": "document",
    "application/msword": "document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
}

# Tipos não suportados pela Meta com mensagem de erro amigável
UNSUPPORTED_MIME = {
    "text/csv": "CSV não é suportado pelo WhatsApp. Converta para .xlsx ou .pdf antes de enviar.",
    "audio/webm": None,  # tratado via conversão ffmpeg
}


def convert_webm_to_ogg(webm_bytes: bytes) -> bytes:
    """Converte audio/webm para audio/ogg usando ffmpeg (via pipes, sem disco)."""
    result = subprocess.run(
        ["ffmpeg", "-f", "webm", "-i", "pipe:0", "-c:a", "libopus", "-f", "ogg", "pipe:1", "-y", "-loglevel", "error"],
        input=webm_bytes,
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg error: {result.stderr.decode()}")
    return result.stdout


def convert_video_to_h264(video_bytes: bytes) -> bytes:
    """
    Converte vídeo para MP4 H.264 + AAC compatível com WhatsApp/Meta.
    Usa arquivo temporário para garantir moov atom no início (faststart).
    """
    with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as out_f:
        out_path = out_f.name
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-i", "pipe:0",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart",
                "-f", "mp4", out_path,
                "-y", "-loglevel", "error"
            ],
            input=video_bytes,
            capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg video error: {result.stderr.decode()}")
        with open(out_path, 'rb') as f:
            return f.read()
    finally:
        if os.path.exists(out_path):
            os.unlink(out_path)


@router.get("/media/{media_id}")
async def proxy_media(
    media_id: str,
    db: Session = Depends(get_db)
):
    """
    Proxy de mídia sem armazenamento em disco.

    Fluxo:
    1. Consulta Meta API para obter URL temporária de download
    2. Faz streaming dos bytes direto da Meta para o browser
    3. Nenhum byte é salvo em disco

    Zero storage no servidor.
    """
    # TODO: extrair empresa_id do JWT; por ora usa empresa_id=1
    empresa = db.query(Empresa).filter(
        Empresa.id == 1,
        Empresa.ativa == True
    ).first()

    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")

    whatsapp_service = WhatsAppService(empresa)

    try:
        # 1. Obter URL temporária da Meta
        media_info = await whatsapp_service.get_media_url(media_id)
        download_url = media_info.get("url")
        mime_type = media_info.get("mime_type", "application/octet-stream")

        if not download_url:
            raise HTTPException(status_code=404, detail="URL de mídia não disponível")

        # 2. Streaming: bytes fluem da Meta → servidor → browser (sem disco)
        async def stream_from_meta():
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "GET",
                    download_url,
                    headers={"Authorization": f"Bearer {empresa.whatsapp_token}"},
                    timeout=60.0
                ) as resp:
                    resp.raise_for_status()
                    async for chunk in resp.aiter_bytes(chunk_size=8192):
                        yield chunk

        return StreamingResponse(
            stream_from_meta(),
            media_type=mime_type,
            headers={
                "Cache-Control": "public, max-age=3600",
                "Content-Disposition": "inline",
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Erro ao fazer proxy de mídia {media_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/media/send", response_model=MensagemResponse)
async def send_media(
    whatsapp_number: str = Form(...),
    caption: str = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Recebe arquivo do atendente, faz upload para Meta e envia via WhatsApp.

    Fluxo:
    1. Lê arquivo em memória (sem salvar em disco)
    2. Upload para Meta API (obtém media_id)
    3. Envia mensagem WhatsApp referenciando o media_id
    4. Salva log no banco com media_id nos dados_extras
    5. Libera bytes da memória

    Zero storage no servidor.
    """
    # TODO: extrair empresa_id do JWT; por ora usa empresa_id=1
    empresa = db.query(Empresa).filter(
        Empresa.id == 1,
        Empresa.ativa == True
    ).first()

    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")

    whatsapp_service = WhatsAppService(empresa)

    # Ler arquivo em memória
    file_bytes = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    # Strip codec suffix: "audio/webm;codecs=opus" → "audio/webm"
    base_mime = mime_type.split(';')[0].strip()
    file_name = file.filename or "arquivo"

    # Verificar tipos explicitamente não suportados
    if base_mime in UNSUPPORTED_MIME and UNSUPPORTED_MIME[base_mime] is not None:
        raise HTTPException(status_code=400, detail=UNSUPPORTED_MIME[base_mime])

    # Converter audio/webm → audio/ogg via ffmpeg (Meta não aceita webm)
    upload_mime = base_mime
    if base_mime == "audio/webm":
        print(f"🔄 Convertendo audio/webm → audio/ogg via ffmpeg")
        file_bytes = convert_webm_to_ogg(file_bytes)
        upload_mime = "audio/ogg"
        ext = file_name.rsplit('.', 1)[-1] if '.' in file_name else 'webm'
        file_name = file_name.replace(f'.{ext}', '.ogg') if f'.{ext}' in file_name else file_name + '.ogg'

    # Converter vídeo para H.264/MP4 (Meta rejeita H.265/HEVC e outros codecs)
    if upload_mime in ("video/mp4", "video/3gpp", "video/quicktime", "video/x-msvideo"):
        print(f"🔄 Convertendo vídeo para H.264/MP4 via ffmpeg")
        file_bytes = convert_video_to_h264(file_bytes)
        upload_mime = "video/mp4"
        name_base = file_name.rsplit('.', 1)[0] if '.' in file_name else file_name
        file_name = name_base + '.mp4'

    # Determinar tipo WhatsApp
    wa_type = MIME_TO_WA_TYPE.get(upload_mime, "document")
    print(f"📎 Upload mídia: mime={mime_type!r} → upload={upload_mime!r} → wa_type={wa_type!r}")

    try:
        # Upload para Meta → media_id
        media_id = await whatsapp_service.upload_media(file_bytes, upload_mime, file_name)

        # Enviar mensagem WhatsApp com o media_id
        message_id = await whatsapp_service.send_media_message(
            to=whatsapp_number,
            media_type=wa_type,
            media_id=media_id,
            caption=caption or None,
            filename=file_name if wa_type == "document" else None,
        )

        # Texto exibido no chat
        if caption:
            content = caption
        elif wa_type == "image":
            content = f"📷 {file_name}"
        elif wa_type == "audio":
            content = "🎵 Áudio"
        elif wa_type == "video":
            content = f"🎥 {file_name}"
        else:
            content = f"📄 {file_name}"

        # Salvar no log
        mensagem_log = MensagemLog(
            empresa_id=1,
            whatsapp_number=whatsapp_number,
            message_id=message_id,
            direcao="enviada",
            tipo_mensagem=wa_type,
            conteudo=content,
            dados_extras={
                "media_id": media_id,
                "mime_type": upload_mime,
                "filename": file_name,
            },
            timestamp=datetime.now(timezone.utc),
            lida=False
        )
        db.add(mensagem_log)

        # Atualizar atendimento
        atendimento = db.query(Atendimento).filter(
            Atendimento.whatsapp_number == whatsapp_number,
            Atendimento.status.in_(['bot', 'aguardando', 'em_atendimento'])
        ).order_by(Atendimento.iniciado_em.desc()).first()

        if atendimento:
            atendimento.ultima_mensagem_em = datetime.now(timezone.utc)

        db.commit()
        db.refresh(mensagem_log)

        return mensagem_log

    except Exception as e:
        db.rollback()
        print(f"❌ Erro enviando mídia: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Liberar bytes da memória explicitamente
        del file_bytes
