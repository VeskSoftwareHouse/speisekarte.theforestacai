import { useState } from 'react'
import { ChartColumn, ClipboardList, LogOut, Menu, Package, UtensilsCrossed, X, type LucideIcon } from 'lucide-react'

export type PanelTab = 'pedidos' | 'cardapio' | 'estoque' | 'relatorios'

/**
 * As três telas do painel, lado a lado no topo. São destinos, não interruptores:
 * clicar em "Cardápio" leva ao cardápio, e a aba acesa diz onde a pessoa está.
 * Antes cada botão ligava e desligava a própria tela, e a única forma de voltar
 * ao quadro era um quarto botão que trocava de nome no meio do caminho.
 */
export const PANEL_TABS: { id: PanelTab; label: string; icon: LucideIcon }[] = [
  { id: 'pedidos', label: 'Pedidos', icon: ClipboardList },
  { id: 'cardapio', label: 'Cardápio', icon: UtensilsCrossed },
  { id: 'estoque', label: 'Estoque', icon: Package },
  { id: 'relatorios', label: 'Relatórios', icon: ChartColumn },
]

interface Props {
  tab: PanelTab
  onTabChange: (tab: PanelTab) => void
  /** Pedidos do dia que ainda não foram entregues. Só aparece na aba Pedidos. */
  activeCount: number
  connected: boolean
  connectionError?: string | null
  userEmail?: string
  onSignOut: () => void
}

export default function PanelHeader({
  tab,
  onTabChange,
  activeCount,
  connected,
  connectionError,
  userEmail,
  onSignOut,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="brand-banner">
      <img src="/brand/logo.png" alt="Forest Açaí" className="brand-banner__logo" />

      <div className="brand-banner__info">
        <p className="brand-banner__eyebrow">Painel da Equipe</p>
        {/* O título acompanha a aba: antes dizia "Pedidos" mesmo com o cardápio
            ocupando a tela inteira. */}
        <h1 className="brand-banner__value">
          {PANEL_TABS.find((item) => item.id === tab)?.label}
          {tab === 'pedidos' && activeCount > 0 && <small>{activeCount} ativos</small>}
        </h1>
      </div>

      <nav className="banner-tabs" aria-label="Seções do painel">
        {PANEL_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`banner-tabs__item ${tab === id ? 'banner-tabs__item--active' : ''}`}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => onTabChange(id)}
          >
            <Icon size={17} strokeWidth={2} aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      {/* Mesmos destinos do .banner-tabs acima, só que num menu que abre por
          cima em vez de uma fileira que precisa rolar — a troca acontece só
          no CSS (ver @media em equipe.css), os dois convivem no DOM. */}
      <div className="banner-hamburger">
        <button
          className="banner-hamburger__toggle"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={20} strokeWidth={2} aria-hidden /> : <Menu size={20} strokeWidth={2} aria-hidden />}
        </button>
        {menuOpen && (
          <nav className="banner-hamburger__menu" aria-label="Seções do painel">
            {PANEL_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`banner-hamburger__item ${tab === id ? 'banner-hamburger__item--active' : ''}`}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => {
                  onTabChange(id)
                  setMenuOpen(false)
                }}
              >
                <Icon size={18} strokeWidth={2} aria-hidden />
                {label}
              </button>
            ))}
          </nav>
        )}
      </div>

      <div className="banner-account">
        {/* Uma bolinha verde sozinha não diz o que significa; com a palavra ao
            lado, diz — e o vermelho passa a ser um aviso, não um enfeite. */}
        <span
          className="banner-status"
          title={connectionError ?? 'Pedidos novos aparecem sozinhos, sem recarregar a página'}
        >
          <span className={`realtime-dot ${connected ? 'realtime-dot--on' : 'realtime-dot--off'}`} />
          <span className="banner-status__label">{connected ? 'Ao vivo' : 'Sem conexão'}</span>
        </span>
        <button className="banner-signout" onClick={onSignOut} title={`Sair de ${userEmail ?? 'sua conta'}`}>
          <LogOut size={16} strokeWidth={2} aria-hidden />
          <span className="banner-signout__label">Sair</span>
        </button>
      </div>
    </header>
  )
}
