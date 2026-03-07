import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaReact, FaPython, FaAws, FaMobile, FaLaptopCode, FaRobot, FaShieldAlt, FaInstagram, FaWhatsapp, FaEnvelope } from 'react-icons/fa';
import { SiDjango, SiFastapi } from 'react-icons/si';
import { MdLocalHospital, MdFitnessCenter } from 'react-icons/md';
import { GiHeartBeats, GiScales } from 'react-icons/gi';
import logo from '../assets/logo.png';
import './Portfolio.css';

const Portfolio: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const stacks = [
    { name: 'React.js', Icon: FaReact },
    { name: 'React Native', Icon: FaMobile },
    { name: 'Python', Icon: FaPython },
    { name: 'Django', Icon: SiDjango },
    { name: 'FastAPI', Icon: SiFastapi },
    { name: 'AWS EC2', Icon: FaAws }
  ];

  const segments = [
    { name: 'Hospitais', Icon: MdLocalHospital, color: '#ff6b6b' },
    { name: 'Academias', Icon: MdFitnessCenter, color: '#4ecdc4' },
    { name: 'Fisioterapia', Icon: GiHeartBeats, color: '#95e1d3' },
    { name: 'Advocacia', Icon: GiScales, color: '#f38181' }
  ];

  const services = [
    { Icon: FaMobile, title: 'Apps Mobile', description: 'Desenvolvimento de aplicativos Android e iOS nativos' },
    { Icon: FaLaptopCode, title: 'Aplicativos Web', description: 'Sistemas web responsivos e modernos' },
    { Icon: FaRobot, title: 'Automações', description: 'Automações inteligentes para diversos segmentos' }
  ];

  return (
    <div className="portfolio-home">
      <header className="portfolio-header">
        <div className="container header-content">
          <div className="portfolio-logo">
            <img src={logo} alt="YourSystem Logo" />
            <span>YourSystem</span>
          </div>
          <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? '\u2715' : '\u2630'}
          </button>
          <nav className={`portfolio-nav ${menuOpen ? 'nav-open' : ''}`}>
            <a href="#about" onClick={() => setMenuOpen(false)}>Sobre</a>
            <a href="#stacks" onClick={() => setMenuOpen(false)}>Tecnologias</a>
            <a href="#services" onClick={() => setMenuOpen(false)}>Serviços</a>
            <a href="#contact" onClick={() => setMenuOpen(false)}>Contato</a>
            <Link to="/login" className="btn-login-nav" onClick={() => setMenuOpen(false)}>Área do Cliente</Link>
          </nav>
        </div>
      </header>

      <section className="portfolio-hero">
        <div className="container hero-content">
          <div className="hero-text">
            <h1 className="hero-title">
              Produzimos as <span className="highlight">melhores soluções</span> em sistemas e automações para sua empresa
            </h1>
            <p className="hero-subtitle">
              Transforme seu negócio com tecnologia de ponta e automações inteligentes
            </p>
            <div className="hero-buttons">
              <a href="#contact" className="btn btn-primary">Entre em Contato</a>
              <Link to="/cadastro" className="btn btn-secondary">Cadastre sua Empresa</Link>
            </div>
          </div>
          <div className="hero-image">
            <div className="image-wrapper">
              <img src={logo} alt="YourSystem" />
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="portfolio-about">
        <div className="container">
          <h2 className="section-title">Sobre Mim</h2>
          <p className="about-text">
            Desenvolvedor full-stack especializado em criar soluções completas para empresas.
            Trabalho com as tecnologias mais modernas do mercado para entregar sistemas robustos,
            escaláveis e seguros, sempre seguindo as melhores práticas e a LGPD.
          </p>
        </div>
      </section>

      <section id="stacks" className="portfolio-stacks">
        <div className="container">
          <h2 className="section-title">Tecnologias</h2>
          <div className="stacks-grid">
            {stacks.map((stack, index) => (
              <div key={index} className="stack-card">
                <div className="stack-icon"><stack.Icon /></div>
                <h3>{stack.name}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="services" className="portfolio-services">
        <div className="container">
          <h2 className="section-title">Nossos Serviços</h2>
          <div className="services-grid">
            {services.map((service, index) => (
              <div key={index} className="service-card">
                <div className="service-icon"><service.Icon /></div>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
              </div>
            ))}
          </div>

          <div className="segments-section">
            <h3 className="segments-title">Segmentos que Atendemos</h3>
            <div className="segments-grid">
              {segments.map((segment, index) => (
                <div key={index} className="segment-card" style={{ ['--segment-color' as any]: segment.color }}>
                  <div className="segment-icon"><segment.Icon /></div>
                  <h4>{segment.name}</h4>
                </div>
              ))}
            </div>
            <p className="segments-note">E muito mais!</p>
          </div>

          <div className="security-badge">
            <FaShieldAlt className="shield-icon" />
            <div className="security-text">
              <h4>Segurança e Privacidade</h4>
              <p>Criptografia de ponta a ponta seguindo a Lei Geral de Proteção de Dados (LGPD)</p>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="portfolio-contact">
        <div className="container">
          <h2 className="section-title">Entre em Contato</h2>
          <div className="contact-grid">
            <a href="mailto:contato@yoursystem.dev.br" className="contact-card">
              <FaEnvelope />
              <span>contato@yoursystem.dev.br</span>
            </a>
            <a href="https://wa.me/5575992057013" target="_blank" rel="noopener noreferrer" className="contact-card">
              <FaWhatsapp />
              <span>+55 75 99205-7013</span>
            </a>
            <a href="https://instagram.com/your_system7" target="_blank" rel="noopener noreferrer" className="contact-card">
              <FaInstagram />
              <span>@your_system7</span>
            </a>
          </div>
        </div>
      </section>

      <footer className="portfolio-footer">
        <div className="container footer-content">
          <div className="footer-links">
            <Link to="/privacy">Política de Privacidade</Link>
            <Link to="/termos">Termos de Uso</Link>
            <Link to="/data">Exclusão de Dados</Link>
          </div>
          <p className="footer-copy">
            &copy; 2026 YourSystem Automações e Sistemas. Todos os direitos reservados.
          </p>
          <p className="footer-domain">yoursystem.dev.br</p>
        </div>
      </footer>
    </div>
  );
};

export default Portfolio;
