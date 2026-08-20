import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { REGISTRATION_SYSTEM_DEFAULTS } from '@kunk/config';
import { usePublicConfig } from '../config/PublicConfigProvider.jsx';
import { Icon } from '../components/Icon.jsx';

/** Quebra o texto em parágrafos a cada ponto final. */
function paragraphsFromWelcomeText(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  return raw
    .split(/(?<=\.)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function WelcomePage() {
  const { config: cfg } = usePublicConfig();
  const welcomeText =
    String(cfg.welcomeText || '').trim() || REGISTRATION_SYSTEM_DEFAULTS.welcomeText;
  const associationFullName = String(
    cfg.associationFullName || cfg.associationName || 'associação',
  ).trim();
  const paragraphs = useMemo(() => paragraphsFromWelcomeText(welcomeText), [welcomeText]);

  return (
    <div className="welcome-page">
      <div className="docs-page welcome-page-inner">
        <h1 className="form-page-title welcome-page-title">
          <span className="welcome-page-title-main">Bem-vindo</span>
          <span className="welcome-page-title-sub">
            Cadastro de Associados da {associationFullName}
          </span>
        </h1>

        <div className="docs-assistant">
          <section className="docs-subject welcome-card">
            <header className="docs-subject-header">
              <h2 className="docs-subject-title">Começar cadastro</h2>
            </header>
            <div className="welcome-card-text">
              {paragraphs.map((paragraph) => (
                <p key={paragraph} className="docs-advance-text welcome-card-paragraph">
                  {paragraph}
                </p>
              ))}
            </div>
            <Link className="btn btn-success docs-primary-btn welcome-cta" to="/cadastro-associado">
              <Icon name="arrowRight" size={18} />
              Iniciar cadastro
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
