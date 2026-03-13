import sqlite3
import os
import json
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/niver-sobrinha", tags=["niver-sobrinha"])

# Caminho para o banco SQLite independente
DB_PATH = "/app/aniversario.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Tabela de Convidados
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS guests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Tabela de Presentes Reservados
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS gift_reservations (
            gift_id TEXT PRIMARY KEY,
            reserved_by TEXT NOT NULL,
            reserved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

# Inicializar banco na carga do módulo
init_db()

class GuestConfirmRequest(BaseModel):
    name: str

class GiftReserveRequest(BaseModel):
    giftId: str
    name: str
    action: str  # 'reserve'

@router.get("/test")
async def test_aniversario():
    return {"status": "ok", "message": "Router de aniversário ativo"}

@router.post("/guests")
async def confirm_presence(data: GuestConfirmRequest):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO guests (name) VALUES (?)", (data.name,))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/guests")
async def list_guests():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT name, confirmed_at FROM guests ORDER BY confirmed_at DESC")
        rows = cursor.fetchall()
        guests = [{"name": row["name"], "confirmedAt": row["confirmed_at"]} for row in rows]
        conn.close()
        return {"guests": guests}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/gifts")
async def list_gifts():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT gift_id, reserved_by FROM gift_reservations")
        rows = cursor.fetchall()
        reserved = {row["gift_id"]: {"reserved": True, "reservedBy": row["reserved_by"]} for row in rows}
        conn.close()
        return {"reserved": reserved}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/gifts")
async def reserve_gift(data: GiftReserveRequest):
    if data.action != "reserve":
        raise HTTPException(status_code=400, detail="Ação inválida")
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        # Verificar se já está reservado
        cursor.execute("SELECT gift_id FROM gift_reservations WHERE gift_id = ?", (data.giftId,))
        if cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Presente já reservado")
            
        cursor.execute("INSERT INTO gift_reservations (gift_id, reserved_by) VALUES (?, ?)", (data.giftId, data.name))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))
