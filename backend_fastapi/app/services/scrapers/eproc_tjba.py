"""
Scraper EPROC TJBA — Consulta Processual Pública
Usa Chrome real via undetected-chromedriver para evitar detecção.

Uso:
    python eproc_tjba.py 0156586-76.2025.8.05.0001
"""
import time
import sys
import logging
from dataclasses import dataclass, field
from typing import Optional

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

logger = logging.getLogger("scraper.eproc_tjba")

URL_CONSULTA = "https://eproc1g.tjba.jus.br/eproc/externo_controlador.php?acao=processo_consulta_publica"


@dataclass
class MovimentacaoScraping:
    data: str
    descricao: str
    orgao: str = ""
    texto_completo: str = ""


@dataclass
class ProcessoScraping:
    numero: str
    classe: str = ""
    assunto: str = ""
    orgao_julgador: str = ""
    partes: list = field(default_factory=list)
    movimentacoes: list[MovimentacaoScraping] = field(default_factory=list)
    erro: str = ""


def _criar_driver(headless: bool = False) -> uc.Chrome:
    """Cria instância do Chrome real com undetected-chromedriver."""
    options = uc.ChromeOptions()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1280,900")
    options.add_argument("--lang=pt-BR")
    # NÃO usa headless — Chrome visível passa pelo CAPTCHA humano se aparecer
    # options.headless = headless  # deixa False para desenvolvimento

    driver = uc.Chrome(options=options, use_subprocess=True, version_main=135)
    return driver


def scrape_processo(numero_cnj: str, headless: bool = False) -> ProcessoScraping:
    """
    Faz scraping do processo no EPROC TJBA.
    Retorna ProcessoScraping com dados e movimentações.
    """
    resultado = ProcessoScraping(numero=numero_cnj)
    driver = None

    try:
        driver = _criar_driver(headless=headless)
        wait = WebDriverWait(driver, 20)

        logger.info(f"Abrindo EPROC TJBA para processo {numero_cnj}...")
        driver.get(URL_CONSULTA)
        time.sleep(2)

        # Preenche número do processo
        campo_numero = wait.until(
            EC.presence_of_element_located((By.ID, "txtNumProcesso"))
        )
        campo_numero.clear()
        campo_numero.send_keys(numero_cnj)
        logger.info(f"Número preenchido: {numero_cnj}")

        # Extrai e exibe CAPTCHA ANTES de submeter (imagem já está na página)
        _exibir_captcha_e_preencher(driver)

        # Submete o formulário
        try:
            btn = driver.find_element(By.CSS_SELECTOR,
                "button[type='submit'], input[type='submit'], #btnPesquisar, "
                "input[value='Pesquisar'], button#btnPesquisar"
            )
            btn.click()
        except NoSuchElementException:
            driver.execute_script("document.getElementById('frmProcessoLista').submit();")

        time.sleep(3)

        # Lida com possível alert residual (erro de captcha, etc.)
        _dispensar_alert(driver)

        # Salva screenshot para debug
        driver.save_screenshot("/tmp/eproc_apos_busca.png")
        print(f"📸 Screenshot salvo: /tmp/eproc_apos_busca.png")

        # Salva HTML para analisar estrutura
        with open("/tmp/eproc_pagina.html", "w", encoding="utf-8", errors="replace") as f:
            f.write(driver.page_source)
        print(f"📄 HTML salvo: /tmp/eproc_pagina.html")

        pagina_atual = driver.current_url
        logger.info(f"URL após busca: {pagina_atual}")
        print(f"🌐 URL atual: {pagina_atual}")

        # Verifica erro de captcha incorreto na página
        if "código" in driver.page_source.lower() and "incorreto" in driver.page_source.lower():
            print("❌ Código CAPTCHA incorreto! Tente novamente.")
            resultado.erro = "Código CAPTCHA incorreto"
            return resultado

        # Se está na listagem, clica no primeiro resultado
        try:
            link_processo = wait.until(
                EC.element_to_be_clickable((By.CSS_SELECTOR,
                    "a[href*='processo_selecionar'], a[href*='processo_consulta_publica_dados'], td.infraTdLinks a"
                ))
            )
            print(f"🔗 Link encontrado: {link_processo.text} — clicando...")
            link_processo.click()
            time.sleep(2)
            driver.save_screenshot("/tmp/eproc_detalhe.png")
            with open("/tmp/eproc_detalhe.html", "w", encoding="utf-8", errors="replace") as f:
                f.write(driver.page_source)
            print(f"📸 Screenshot detalhe: /tmp/eproc_detalhe.png")
        except TimeoutException:
            print("ℹ️  Nenhum link de listagem — pode já estar no detalhe")

        # Extrai dados do processo
        resultado = _extrair_dados(driver, numero_cnj)

    except Exception as e:
        logger.error(f"Erro no scraping de {numero_cnj}: {e}")
        resultado.erro = str(e)
    finally:
        if driver:
            time.sleep(1)
            driver.quit()

    return resultado


def _exibir_captcha_e_preencher(driver):
    """
    Extrai a imagem CAPTCHA da página (base64 inline), salva como PNG,
    pede ao usuário que leia o código e preenche o campo txtInfraCaptcha.
    O EPROC TJBA tem o CAPTCHA visível na própria página antes do submit.
    """
    import base64

    # Tenta extrair imagem base64 do CAPTCHA
    captcha_b64 = None
    try:
        # Tenta pelo elemento de imagem com title de captcha
        img = driver.find_element(By.CSS_SELECTOR,
            "img[title*='confirmação'], img[title*='captcha'], img[title*='Captcha'], "
            "#imgInfraCaptcha, img[src*='captcha'], img[src^='data:image']"
        )
        src = img.get_attribute("src") or ""
        if src.startswith("data:image"):
            # Remove prefixo "data:image/png;base64,"
            captcha_b64 = src.split(",", 1)[1]
            print(f"🖼️  Imagem CAPTCHA encontrada (base64, {len(captcha_b64)} chars)")
    except NoSuchElementException:
        pass

    if captcha_b64:
        try:
            img_bytes = base64.b64decode(captcha_b64)
            with open("/tmp/eproc_captcha_image.png", "wb") as f:
                f.write(img_bytes)
            print(f"💾 CAPTCHA salvo em: /tmp/eproc_captcha_image.png")
            print(f"   👉 Abra o arquivo acima para ver o código.")
        except Exception as e:
            print(f"⚠️  Não foi possível salvar imagem CAPTCHA: {e}")
    else:
        # Fallback: screenshot completo
        driver.save_screenshot("/tmp/eproc_captcha_screen.png")
        print(f"📸 Screenshot salvo (sem base64): /tmp/eproc_captcha_screen.png")
        print(f"   👉 Olhe o navegador aberto e leia o código de confirmação.")

    # Verifica se há campo de captcha na página
    try:
        campo_captcha = driver.find_element(By.CSS_SELECTOR,
            "#txtInfraCaptcha, input[name*='captcha'], input[name*='Captcha'], "
            "input[id*='captcha'], input[placeholder*='código']"
        )
        codigo = input("\n   🔐 Digite o código de confirmação da imagem: ").strip()
        campo_captcha.clear()
        campo_captcha.send_keys(codigo)
        print(f"✅ Código '{codigo}' preenchido no campo.")
    except NoSuchElementException:
        print("ℹ️  Campo de CAPTCHA não encontrado na página — pode não ter CAPTCHA ou já estar preenchido.")


def _dispensar_alert(driver):
    """Aceita qualquer JS alert pendente (erros de CAPTCHA, avisos, etc.)."""
    try:
        alert = driver.switch_to.alert
        texto = alert.text
        print(f"⚠️  Alert detectado após submit: '{texto}'")
        alert.accept()
        time.sleep(1)
    except Exception:
        pass


def _tem_captcha(driver) -> bool:
    """Verifica se há CAPTCHA visível na página."""
    try:
        captcha = driver.find_element(By.ID, "divInfraCaptcha")
        return captcha.is_displayed()
    except NoSuchElementException:
        return False


def _extrair_dados(driver, numero_cnj: str) -> ProcessoScraping:
    """Extrai dados do processo da página de detalhe."""
    resultado = ProcessoScraping(numero=numero_cnj)

    html = driver.page_source

    # ── Classe processual ──────────────────────────────────────────────────────
    for seletor in [
        "#fldDadosGerais .infraTd:nth-child(2)",
        "span#txtClasse",
        "[id*='Classe']",
        "td:contains('Classe')",
    ]:
        try:
            el = driver.find_element(By.CSS_SELECTOR, seletor)
            if el.text.strip():
                resultado.classe = el.text.strip()
                break
        except Exception:
            continue

    # Fallback: busca genérica por label "Classe"
    if not resultado.classe:
        resultado.classe = _extrair_por_label(driver, "Classe")

    # ── Assunto ────────────────────────────────────────────────────────────────
    resultado.assunto = _extrair_por_label(driver, "Assunto")

    # ── Órgão Julgador ────────────────────────────────────────────────────────
    resultado.orgao_julgador = _extrair_por_label(driver, ["Órgão", "Vara", "Juízo"])

    # ── Partes ────────────────────────────────────────────────────────────────
    resultado.partes = _extrair_partes(driver)

    # ── Movimentações ─────────────────────────────────────────────────────────
    resultado.movimentacoes = _extrair_movimentacoes(driver)

    logger.info(
        f"Extração concluída: classe={resultado.classe}, "
        f"partes={len(resultado.partes)}, movs={len(resultado.movimentacoes)}"
    )
    return resultado


def _extrair_por_label(driver, labels) -> str:
    """Busca valor de uma célula a partir do label (th/td com o texto)."""
    if isinstance(labels, str):
        labels = [labels]

    try:
        rows = driver.find_elements(By.CSS_SELECTOR, "tr, .row, div[class*='linha']")
        for row in rows:
            texto_row = row.text
            for label in labels:
                if label.lower() in texto_row.lower():
                    # Pega todas as tds e retorna a segunda (valor)
                    tds = row.find_elements(By.CSS_SELECTOR, "td, span, div")
                    for i, td in enumerate(tds):
                        if label.lower() in td.text.lower() and i + 1 < len(tds):
                            valor = tds[i + 1].text.strip()
                            if valor and valor.lower() not in [label.lower(), ""]:
                                return valor
    except Exception:
        pass
    return ""


def _extrair_partes(driver) -> list:
    """Extrai partes do processo (autor, réu, advogados)."""
    partes = []
    try:
        # EPROC geralmente tem tabela de partes com classe específica
        tabela = driver.find_elements(By.CSS_SELECTOR,
            "table[id*='parte'], table[id*='Parte'], #tblPartes, .partes-processo"
        )
        if not tabela:
            # Busca por heading
            for el in driver.find_elements(By.CSS_SELECTOR, "h2, h3, th, caption"):
                if "part" in el.text.lower():
                    # Pega tabela próxima
                    try:
                        tbl = el.find_element(By.XPATH, "following::table[1]")
                        tabela = [tbl]
                        break
                    except Exception:
                        pass

        for tbl in tabela:
            linhas = tbl.find_elements(By.CSS_SELECTOR, "tr")
            for linha in linhas:
                colunas = linha.find_elements(By.CSS_SELECTOR, "td")
                if len(colunas) >= 2:
                    tipo = colunas[0].text.strip()
                    nome = colunas[1].text.strip()
                    if nome and tipo:
                        partes.append({"tipo": tipo, "nome": nome})
    except Exception as e:
        logger.debug(f"Erro ao extrair partes: {e}")

    return partes


def _extrair_movimentacoes(driver) -> list[MovimentacaoScraping]:
    """Extrai timeline de movimentações com texto completo."""
    movs = []
    try:
        # EPROC lista movimentações em tabela específica
        linhas = driver.find_elements(By.CSS_SELECTOR,
            "table[id*='mov'] tr, table[id*='Mov'] tr, "
            "#tblMovimentos tr, .movimentos tr, "
            "tr[id*='mov'], tr[id*='Mov']"
        )

        if not linhas:
            # Busca por heading de movimentações
            for el in driver.find_elements(By.CSS_SELECTOR, "h2, h3, caption, th"):
                if any(t in el.text.lower() for t in ["moviment", "andament", "históric"]):
                    try:
                        tbl = el.find_element(By.XPATH, "following::table[1]")
                        linhas = tbl.find_elements(By.CSS_SELECTOR, "tr")
                        break
                    except Exception:
                        pass

        for linha in linhas:
            colunas = linha.find_elements(By.CSS_SELECTOR, "td")
            if len(colunas) >= 2:
                data = colunas[0].text.strip()
                descricao = colunas[1].text.strip() if len(colunas) > 1 else ""
                orgao = colunas[2].text.strip() if len(colunas) > 2 else ""

                # Pula cabeçalhos
                if not data or data.lower() in ["data", "movimentação", "andamento"]:
                    continue

                # Tenta expandir para ver texto completo (se houver link)
                texto_completo = descricao
                try:
                    link = linha.find_element(By.CSS_SELECTOR, "a")
                    if link:
                        # Abre em nova aba para não perder a lista
                        href = link.get_attribute("href")
                        if href:
                            driver.execute_script(f"window.open('{href}', '_blank');")
                            time.sleep(1.5)
                            driver.switch_to.window(driver.window_handles[-1])
                            texto_completo = driver.find_element(By.CSS_SELECTOR, "body").text[:3000]
                            driver.close()
                            driver.switch_to.window(driver.window_handles[0])
                except Exception:
                    pass

                movs.append(MovimentacaoScraping(
                    data=data,
                    descricao=descricao,
                    orgao=orgao,
                    texto_completo=texto_completo,
                ))

    except Exception as e:
        logger.debug(f"Erro ao extrair movimentações: {e}")

    return movs


# ─── CLI para teste ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    numero = sys.argv[1] if len(sys.argv) > 1 else "0156586-76.2025.8.05.0001"
    print(f"\n🔍 Buscando processo: {numero}")
    print(f"🌐 Portal: {URL_CONSULTA}\n")

    resultado = scrape_processo(numero, headless=False)

    if resultado.erro:
        print(f"❌ Erro: {resultado.erro}")
    else:
        print(f"✅ Processo encontrado!\n")
        print(f"  Classe:         {resultado.classe or '—'}")
        print(f"  Assunto:        {resultado.assunto or '—'}")
        print(f"  Órgão Julgador: {resultado.orgao_julgador or '—'}")
        print(f"  Partes:         {len(resultado.partes)}")
        for p in resultado.partes:
            print(f"    [{p['tipo']}] {p['nome']}")
        print(f"  Movimentações:  {len(resultado.movimentacoes)}")
        for m in resultado.movimentacoes[:5]:
            print(f"    {m.data} — {m.descricao[:80]}")
        if len(resultado.movimentacoes) > 5:
            print(f"    ... +{len(resultado.movimentacoes) - 5} movimentações")
