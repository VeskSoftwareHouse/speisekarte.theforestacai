import { Trash2 } from 'lucide-react'
import { ORDER_STATUS_LABEL } from '@shared/types'
import type { OrderWithItems, OrderStatus, SelectedModifierOption } from '@shared/types'
import { elapsedLabel, formatCHF, formatSelectedOptionLabel } from '@shared/format'
import { fruitColor } from '../ingredientColors'
import type { IngredienteCopoPronto } from '../hooks/useCopoProntoIngredientes'

const NEXT_ACTION_LABEL: Record<OrderStatus, string | null> = {
  recebido: 'Iniciar preparo',
  em_preparo: 'Marcar como pronto',
  pronto: 'Marcar como entregue',
  entregue: null,
}

const WAIT_WARNING_MIN = 10

/** Adicionais escolhidos, agrupados pela categoria deles (ex: "Früchte",
 * "Toppings") — a ordem segue a ordem em que cada categoria apareceu no
 * pedido, sem impor nenhuma ordem de montagem do copo. */
function agruparPorCategoria(opcoes: SelectedModifierOption[]): { categoria: string; opcoes: SelectedModifierOption[] }[] {
  const porCategoria = new Map<string, SelectedModifierOption[]>()
  for (const opcao of opcoes) {
    const lista = porCategoria.get(opcao.modifier_nome) ?? []
    lista.push(opcao)
    porCategoria.set(opcao.modifier_nome, lista)
  }
  return [...porCategoria.entries()].map(([categoria, opcoes]) => ({ categoria, opcoes }))
}

/** Mesmo agrupamento, pros ingredientes fixos do copo pronto (ver
 * useCopoProntoIngredientes) — só nome e categoria, sem quantidade. */
function agruparIngredientesFixos(ingredientes: IngredienteCopoPronto[]): { categoria: string; nomes: string[] }[] {
  const porCategoria = new Map<string, string[]>()
  for (const ing of ingredientes) {
    const lista = porCategoria.get(ing.categoria) ?? []
    lista.push(ing.option_nome)
    porCategoria.set(ing.categoria, lista)
  }
  return [...porCategoria.entries()].map(([categoria, nomes]) => ({ categoria, nomes }))
}

interface Props {
  order: OrderWithItems
  isNew: boolean
  now: Date
  onAdvance: (order: OrderWithItems) => void
  onSeen: (orderId: string) => void
  /** Pede confirmação pra excluir este pedido — pra tirar da tela e dos
   * relatórios um pedido de teste (ver App.tsx). Nunca exclui na hora. */
  onRequestDelete: (order: OrderWithItems) => void
  /** Ingredientes do copo pronto de cada produto, por menu_item_id (ver
   * useCopoProntoIngredientes) — pra mostrar a receita fixa categorizada
   * igual aos adicionais que o cliente escolhe, em vez do texto solto de
   * descricao_item. */
  ingredientesCopoPronto: Record<string, IngredienteCopoPronto[]>
}

/** Um nome por linha, com a cor da fruta quando for fruta. */
function ListaDeNomes({ nomes }: { nomes: string[] }) {
  return (
    <ul className="order-card__mod-list">
      {nomes.map((nome, i) => (
        <li key={i} style={{ color: fruitColor(nome) }}>
          {nome}
        </li>
      ))}
    </ul>
  )
}

/** Um adicional por linha, com a cor da fruta quando for fruta. */
function ListaDeAdicionais({ opcoes }: { opcoes: SelectedModifierOption[] }) {
  return (
    <ul className="order-card__mod-list">
      {opcoes.map((opcao) => (
        <li key={opcao.option_id} style={{ color: fruitColor(opcao.option_nome) }}>
          {formatSelectedOptionLabel(opcao.option_nome, opcao.quantidade)}
        </li>
      ))}
    </ul>
  )
}

/** Só usado quando o produto não tem os ingredientes do copo pronto
 * cadastrados (ver ProductFormModal → "Copo pronto") e a equipe ainda
 * depende do texto solto de "Enviar descrição na comanda" — itálico e mais
 * claro pra se distinguir da receita de verdade. */
function ListaDaReceita({ texto }: { texto: string }) {
  const ingredientes = texto
    .split(',')
    .map((parte) => parte.trim())
    .filter(Boolean)
  return (
    <ul className="order-card__mod-list order-card__mod-list--receita">
      {ingredientes.map((ingrediente, i) => (
        <li key={i} style={{ color: fruitColor(ingrediente) }}>
          {ingrediente}
        </li>
      ))}
    </ul>
  )
}

export default function OrderCard({ order, isNew, now, onAdvance, onSeen, onRequestDelete, ingredientesCopoPronto }: Props) {
  const nextLabel = NEXT_ACTION_LABEL[order.status]
  const itemCount = order.items.reduce((sum, i) => sum + i.quantidade, 0)
  const total = order.items.reduce((sum, i) => sum + i.preco_unitario * i.quantidade, 0)
  const waitingMin = Math.floor((now.getTime() - new Date(order.criado_em).getTime()) / 60000)
  const isWaitingLong = order.status !== 'entregue' && waitingMin >= WAIT_WARNING_MIN

  return (
    <article
      className={`order-card order-card--${order.status} ${isNew ? 'order-card--new' : ''}`}
      onClick={() => isNew && onSeen(order.id)}
    >
      {isNew && <span className="order-card__new-badge">NOVO</span>}

      <header className="order-card__header">
        <span className="order-card__customer">{order.nome_cliente ?? '—'}</span>
        <div className="order-card__meta">
          <span className={`order-card__time ${isWaitingLong ? 'order-card__time--warning' : ''}`}>
            {elapsedLabel(order.criado_em, now)}
          </span>
          {order.status === 'entregue' && (
            <span className="status-pill status-pill--entregue">{ORDER_STATUS_LABEL.entregue}</span>
          )}
        </div>
        <button
          type="button"
          className="order-card__delete"
          onClick={(e) => {
            e.stopPropagation()
            onRequestDelete(order)
          }}
          aria-label="Excluir pedido"
          title="Excluir pedido (ex: pedido de teste)"
        >
          <Trash2 size={15} strokeWidth={2} />
        </button>
      </header>

      <ul className="order-card__items">
        {order.items.map((item) => {
          const ingredientesFixos = item.menu_item_id ? ingredientesCopoPronto[item.menu_item_id] : undefined
          const gruposFixos = ingredientesFixos ? agruparIngredientesFixos(ingredientesFixos) : []
          const gruposEscolhidos = agruparPorCategoria(item.modifiers_selecionados)
          // Texto solto só entra quando o produto não tem a receita cadastrada
          // como copo pronto — senão a receita de verdade (gruposFixos) já cobre.
          const mostrarTextoLivre = gruposFixos.length === 0 && !!item.descricao_item

          return (
            <li key={item.id} className="order-card__item">
              <div className="order-card__item-row">
                <span className="order-card__item-qty">{item.quantidade}×</span>
                <span className="order-card__item-name">{item.nome_item}</span>
              </div>

              {(mostrarTextoLivre || gruposFixos.length > 0 || gruposEscolhidos.length > 0) && (
                <div className="copo">
                  <div className="copo__corpo">
                    {mostrarTextoLivre && (
                      <div className="copo__camada">
                        <span className="copo__rotulo">Receita</span>
                        <ListaDaReceita texto={item.descricao_item!} />
                      </div>
                    )}
                    {gruposFixos.map(({ categoria, nomes }) => (
                      <div key={categoria} className="copo__camada">
                        <span className="copo__rotulo">{categoria}</span>
                        <ListaDeNomes nomes={nomes} />
                      </div>
                    ))}
                    {gruposEscolhidos.map(({ categoria, opcoes }) => (
                      <div key={categoria} className="copo__camada">
                        <span className="copo__rotulo">{categoria}</span>
                        <ListaDeAdicionais opcoes={opcoes} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {item.observacoes && <p className="order-card__item-obs">Obs: {item.observacoes}</p>}
            </li>
          )
        })}
      </ul>

      <footer className="order-card__footer">
        <div className="order-card__summary">
          <span>
            {itemCount} {itemCount === 1 ? 'item' : 'itens'}
          </span>
          <span>{formatCHF(total)}</span>
        </div>
        {nextLabel && (
          <button
            className="btn btn-primary btn-block order-card__advance"
            onClick={(e) => {
              e.stopPropagation()
              onSeen(order.id)
              onAdvance(order)
            }}
          >
            {nextLabel} →
          </button>
        )}
      </footer>
    </article>
  )
}
