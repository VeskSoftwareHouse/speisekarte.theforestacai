import { useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  CheckCheck,
  ClipboardList,
  LayoutDashboard,
  Percent,
  ShoppingCart,
  Skull,
  Truck,
  Wheat,
} from 'lucide-react'
import type { Fornecedor, Imposto, Insumo, InventarioWithItens, OrderWithItems, PedidoCompraWithItens } from '@shared/types'
import { useFornecedorAdmin } from '../hooks/useFornecedorAdmin'
import { useInsumoAdmin } from '../hooks/useInsumoAdmin'
import { useComprasAdmin } from '../hooks/useComprasAdmin'
import { useEstoqueMovimentos } from '../hooks/useEstoqueMovimentos'
import { useInventarioAdmin } from '../hooks/useInventarioAdmin'
import { usePerdasAdmin } from '../hooks/usePerdasAdmin'
import { useFechamento } from '../hooks/useFechamento'
import { useImpostoAdmin } from '../hooks/useImpostoAdmin'
import FornecedorPanel from './FornecedorPanel'
import FornecedorFormModal from './FornecedorFormModal'
import InsumoPanel from './InsumoPanel'
import InsumoFormModal from './InsumoFormModal'
import CompraPanel from './CompraPanel'
import CompraFormModal from './CompraFormModal'
import MovimentacaoPanel from './MovimentacaoPanel'
import MovimentacaoFormModal from './MovimentacaoFormModal'
import InventarioPanel from './InventarioPanel'
import InventarioFormModal from './InventarioFormModal'
import PerdaPanel from './PerdaPanel'
import PerdaFormModal from './PerdaFormModal'
import FechamentoPanel from './FechamentoPanel'
import FechamentoPreviewModal from './FechamentoPreviewModal'
import VisaoGeralPanel from './VisaoGeralPanel'
import ImpostoPanel from './ImpostoPanel'
import ImpostoFormModal from './ImpostoFormModal'
import ConfirmDialog from './ConfirmDialog'

type DeleteTarget =
  | { kind: 'fornecedor'; item: Fornecedor }
  | { kind: 'insumo'; item: Insumo }
  | { kind: 'pedidoCompra'; item: PedidoCompraWithItens }
  | { kind: 'inventario'; item: InventarioWithItens }
  | { kind: 'imposto'; item: Imposto }

// Visão Geral, Fornecedores, Insumos, Compras, Movimentações, Inventário,
// Perdas, Fechamento, Impostos — módulo completo do plano de estoque.
type Tab =
  | 'visaogeral'
  | 'fornecedores'
  | 'insumos'
  | 'compras'
  | 'movimentacoes'
  | 'inventario'
  | 'perdas'
  | 'fechamento'
  | 'impostos'

interface Props {
  currentUserId: string
}

export default function EstoqueManager({ currentUserId }: Props) {
  const {
    fornecedores,
    loading: fornecedoresLoading,
    error: fornecedoresError,
    createFornecedor,
    updateFornecedor,
    deleteFornecedor,
  } = useFornecedorAdmin()

  const { insumos, loading: insumosLoading, error: insumosError, createInsumo, updateInsumo, deleteInsumo } =
    useInsumoAdmin()

  const {
    pedidos,
    loading: comprasLoading,
    error: comprasError,
    createPedido,
    updatePedido,
    deletePedido,
    receberPedido,
    cancelarPedido,
  } = useComprasAdmin(currentUserId)

  const {
    movimentos,
    saldoPorInsumo,
    loading: movimentosLoading,
    error: movimentosError,
    lancarMovimentoManual,
    reload: reloadMovimentos,
  } = useEstoqueMovimentos(currentUserId)

  const {
    inventarios,
    loading: inventariosLoading,
    error: inventariosError,
    criarEFinalizarInventario,
    deleteInventario,
  } = useInventarioAdmin(currentUserId)

  const { perdas, loading: perdasLoading, error: perdasError, lancarPerdaManual } = usePerdasAdmin(currentUserId)

  const {
    impostos,
    loading: impostosLoading,
    error: impostosError,
    createImposto,
    updateImposto,
    deleteImposto,
  } = useImpostoAdmin()

  const {
    orders: pedidosParaFechar,
    loading: fechamentoLoading,
    error: fechamentoError,
    calcularConsumo,
    fecharPedidos,
  } = useFechamento(currentUserId)

  const [tab, setTab] = useState<Tab>('visaogeral')
  const [fornecedorForm, setFornecedorForm] = useState<'new' | Fornecedor | null>(null)
  const [insumoForm, setInsumoForm] = useState<'new' | Insumo | null>(null)
  const [compraForm, setCompraForm] = useState<'new' | PedidoCompraWithItens | null>(null)
  const [movimentoForm, setMovimentoForm] = useState(false)
  const [inventarioForm, setInventarioForm] = useState(false)
  const [perdaForm, setPerdaForm] = useState(false)
  const [impostoForm, setImpostoForm] = useState<'new' | Imposto | null>(null)
  const [fechamentoSelecionados, setFechamentoSelecionados] = useState<OrderWithItems[] | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const fornecedoresById = useMemo(() => {
    const map: Record<string, Fornecedor> = {}
    for (const f of fornecedores) map[f.id] = f
    return map
  }, [fornecedores])

  const insumosById = useMemo(() => {
    const map: Record<string, Insumo> = {}
    for (const i of insumos) map[i.id] = i
    return map
  }, [insumos])

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return
    setActionError(null)
    try {
      if (deleteTarget.kind === 'fornecedor') await deleteFornecedor(deleteTarget.item.id)
      else if (deleteTarget.kind === 'insumo') await deleteInsumo(deleteTarget.item.id)
      else if (deleteTarget.kind === 'pedidoCompra') await deletePedido(deleteTarget.item.id)
      else if (deleteTarget.kind === 'inventario') await deleteInventario(deleteTarget.item.id)
      else await deleteImposto(deleteTarget.item.id)
      setDeleteTarget(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível excluir.')
      setDeleteTarget(null)
    }
  }

  async function handleReceive(pedido: PedidoCompraWithItens) {
    setActionError(null)
    try {
      await receberPedido(pedido)
      await reloadMovimentos()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível confirmar o recebimento.')
    }
  }

  async function handleCancel(pedido: PedidoCompraWithItens) {
    setActionError(null)
    try {
      await cancelarPedido(pedido.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível cancelar.')
    }
  }

  return (
    <main className="menu-manager">
      <div className="menu-manager__tabs">
        <button
          className={`menu-manager__tab ${tab === 'visaogeral' ? 'menu-manager__tab--active' : ''}`}
          onClick={() => setTab('visaogeral')}
        >
          <LayoutDashboard size={16} strokeWidth={2} aria-hidden />
          Visão Geral
        </button>
        <button
          className={`menu-manager__tab ${tab === 'fornecedores' ? 'menu-manager__tab--active' : ''}`}
          onClick={() => setTab('fornecedores')}
        >
          <Truck size={16} strokeWidth={2} aria-hidden />
          Fornecedores
        </button>
        <button
          className={`menu-manager__tab ${tab === 'insumos' ? 'menu-manager__tab--active' : ''}`}
          onClick={() => setTab('insumos')}
        >
          <Wheat size={16} strokeWidth={2} aria-hidden />
          Insumos
        </button>
        <button
          className={`menu-manager__tab ${tab === 'compras' ? 'menu-manager__tab--active' : ''}`}
          onClick={() => setTab('compras')}
        >
          <ShoppingCart size={16} strokeWidth={2} aria-hidden />
          Compras
        </button>
        <button
          className={`menu-manager__tab ${tab === 'movimentacoes' ? 'menu-manager__tab--active' : ''}`}
          onClick={() => setTab('movimentacoes')}
        >
          <ArrowLeftRight size={16} strokeWidth={2} aria-hidden />
          Movimentações
        </button>
        <button
          className={`menu-manager__tab ${tab === 'inventario' ? 'menu-manager__tab--active' : ''}`}
          onClick={() => setTab('inventario')}
        >
          <ClipboardList size={16} strokeWidth={2} aria-hidden />
          Inventário
        </button>
        <button
          className={`menu-manager__tab ${tab === 'perdas' ? 'menu-manager__tab--active' : ''}`}
          onClick={() => setTab('perdas')}
        >
          <Skull size={16} strokeWidth={2} aria-hidden />
          Perdas
        </button>
        <button
          className={`menu-manager__tab ${tab === 'fechamento' ? 'menu-manager__tab--active' : ''}`}
          onClick={() => setTab('fechamento')}
        >
          <CheckCheck size={16} strokeWidth={2} aria-hidden />
          Fechamento
        </button>
        <button
          className={`menu-manager__tab ${tab === 'impostos' ? 'menu-manager__tab--active' : ''}`}
          onClick={() => setTab('impostos')}
        >
          <Percent size={16} strokeWidth={2} aria-hidden />
          Impostos
        </button>
      </div>

      {tab === 'fornecedores' && fornecedoresError && (
        <p className="equipe-app__error">Erro ao carregar fornecedores: {fornecedoresError}</p>
      )}
      {tab === 'insumos' && insumosError && <p className="equipe-app__error">Erro ao carregar insumos: {insumosError}</p>}
      {tab === 'compras' && comprasError && <p className="equipe-app__error">Erro ao carregar compras: {comprasError}</p>}
      {tab === 'movimentacoes' && movimentosError && (
        <p className="equipe-app__error">Erro ao carregar movimentações: {movimentosError}</p>
      )}
      {tab === 'inventario' && inventariosError && (
        <p className="equipe-app__error">Erro ao carregar inventários: {inventariosError}</p>
      )}
      {tab === 'perdas' && perdasError && <p className="equipe-app__error">Erro ao carregar perdas: {perdasError}</p>}
      {tab === 'fechamento' && fechamentoError && (
        <p className="equipe-app__error">Erro ao carregar pedidos: {fechamentoError}</p>
      )}
      {tab === 'impostos' && impostosError && (
        <p className="equipe-app__error">Erro ao carregar impostos: {impostosError}</p>
      )}
      {actionError && (
        <p className="equipe-app__error" role="alert">
          {actionError}
        </p>
      )}

      {tab === 'visaogeral' && (insumosLoading || movimentosLoading || perdasLoading || comprasLoading || impostosLoading) && (
        <p className="equipe-app__status">Carregando visão geral…</p>
      )}
      {tab === 'visaogeral' &&
        !(insumosLoading || movimentosLoading || perdasLoading || comprasLoading || impostosLoading) && (
        <VisaoGeralPanel
          insumos={insumos}
          saldoPorInsumo={saldoPorInsumo}
          movimentos={movimentos}
          perdas={perdas}
          pedidosCompra={pedidos}
          impostos={impostos}
        />
      )}

      {tab === 'fornecedores' && fornecedoresLoading && <p className="equipe-app__status">Carregando fornecedores…</p>}
      {tab === 'fornecedores' && !fornecedoresLoading && (
        <div className="menu-manager__single">
          <FornecedorPanel
            fornecedores={fornecedores}
            onAdd={() => setFornecedorForm('new')}
            onEdit={(f) => setFornecedorForm(f)}
            onDelete={(f) => setDeleteTarget({ kind: 'fornecedor', item: f })}
          />
        </div>
      )}

      {tab === 'insumos' && insumosLoading && <p className="equipe-app__status">Carregando insumos…</p>}
      {tab === 'insumos' && !insumosLoading && (
        <div className="menu-manager__single">
          <InsumoPanel
            insumos={insumos}
            onAdd={() => setInsumoForm('new')}
            onEdit={(i) => setInsumoForm(i)}
            onDelete={(i) => setDeleteTarget({ kind: 'insumo', item: i })}
          />
        </div>
      )}

      {tab === 'compras' && comprasLoading && <p className="equipe-app__status">Carregando compras…</p>}
      {tab === 'compras' && !comprasLoading && (
        <div className="menu-manager__single">
          <CompraPanel
            pedidos={pedidos}
            fornecedoresById={fornecedoresById}
            impostos={impostos}
            onAdd={() => setCompraForm('new')}
            onEdit={(p) => setCompraForm(p)}
            onReceive={handleReceive}
            onCancel={handleCancel}
            onDelete={(p) => setDeleteTarget({ kind: 'pedidoCompra', item: p })}
          />
        </div>
      )}

      {tab === 'movimentacoes' && movimentosLoading && <p className="equipe-app__status">Carregando movimentações…</p>}
      {tab === 'movimentacoes' && !movimentosLoading && (
        <div className="menu-manager__single">
          <MovimentacaoPanel
            insumos={insumos}
            saldoPorInsumo={saldoPorInsumo}
            movimentos={movimentos}
            onAdd={() => setMovimentoForm(true)}
          />
        </div>
      )}

      {tab === 'inventario' && inventariosLoading && <p className="equipe-app__status">Carregando inventários…</p>}
      {tab === 'inventario' && !inventariosLoading && (
        <div className="menu-manager__single">
          <InventarioPanel
            inventarios={inventarios}
            onAdd={() => setInventarioForm(true)}
            onDelete={(inv) => setDeleteTarget({ kind: 'inventario', item: inv })}
          />
        </div>
      )}

      {tab === 'perdas' && perdasLoading && <p className="equipe-app__status">Carregando perdas…</p>}
      {tab === 'perdas' && !perdasLoading && (
        <div className="menu-manager__single">
          <PerdaPanel perdas={perdas} insumosById={insumosById} onAdd={() => setPerdaForm(true)} />
        </div>
      )}

      {tab === 'fechamento' && fechamentoLoading && <p className="equipe-app__status">Carregando pedidos…</p>}
      {tab === 'fechamento' && !fechamentoLoading && (
        <div className="menu-manager__single">
          <FechamentoPanel orders={pedidosParaFechar} onCloseSelected={setFechamentoSelecionados} />
        </div>
      )}

      {tab === 'impostos' && impostosLoading && <p className="equipe-app__status">Carregando impostos…</p>}
      {tab === 'impostos' && !impostosLoading && (
        <div className="menu-manager__single">
          <ImpostoPanel
            impostos={impostos}
            insumosById={insumosById}
            onAdd={() => setImpostoForm('new')}
            onEdit={(i) => setImpostoForm(i)}
            onDelete={(i) => setDeleteTarget({ kind: 'imposto', item: i })}
          />
        </div>
      )}

      {fornecedorForm && (
        <FornecedorFormModal
          fornecedor={fornecedorForm === 'new' ? null : fornecedorForm}
          onClose={() => setFornecedorForm(null)}
          onSave={async (input) => {
            if (fornecedorForm === 'new') await createFornecedor(input)
            else await updateFornecedor(fornecedorForm.id, input)
          }}
        />
      )}

      {insumoForm && (
        <InsumoFormModal
          insumo={insumoForm === 'new' ? null : insumoForm}
          proximaOrdem={insumos.length ? Math.max(...insumos.map((i) => i.ordem)) + 1 : 1}
          onClose={() => setInsumoForm(null)}
          onSave={async (input) => {
            if (insumoForm === 'new') await createInsumo(input)
            else await updateInsumo(insumoForm.id, input)
          }}
        />
      )}

      {compraForm && (
        <CompraFormModal
          pedido={compraForm === 'new' ? null : compraForm}
          fornecedores={fornecedores}
          insumos={insumos}
          impostos={impostos}
          onClose={() => setCompraForm(null)}
          onSave={async (input, itens) => {
            if (compraForm === 'new') await createPedido(input, itens)
            else await updatePedido(compraForm.id, input, itens)
          }}
        />
      )}

      {movimentoForm && (
        <MovimentacaoFormModal insumos={insumos} onClose={() => setMovimentoForm(false)} onSave={lancarMovimentoManual} />
      )}

      {inventarioForm && (
        <InventarioFormModal
          insumos={insumos}
          saldoPorInsumo={saldoPorInsumo}
          onClose={() => setInventarioForm(false)}
          onSave={async (observacoes, itens) => {
            await criarEFinalizarInventario(observacoes, itens)
            await reloadMovimentos()
          }}
        />
      )}

      {perdaForm && (
        <PerdaFormModal
          insumos={insumos}
          onClose={() => setPerdaForm(false)}
          onSave={async (input) => {
            await lancarPerdaManual(input)
            await reloadMovimentos()
          }}
        />
      )}

      {impostoForm && (
        <ImpostoFormModal
          imposto={impostoForm === 'new' ? null : impostoForm}
          insumos={insumos}
          onClose={() => setImpostoForm(null)}
          onSave={async (input) => {
            if (impostoForm === 'new') await createImposto(input)
            else await updateImposto(impostoForm.id, input)
          }}
        />
      )}

      {fechamentoSelecionados && (
        <FechamentoPreviewModal
          selecionados={fechamentoSelecionados}
          insumos={insumos}
          calcularConsumo={calcularConsumo}
          onClose={() => setFechamentoSelecionados(null)}
          onConfirm={async () => {
            await fecharPedidos(fechamentoSelecionados)
            await reloadMovimentos()
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={
            deleteTarget.kind === 'fornecedor'
              ? 'Excluir fornecedor?'
              : deleteTarget.kind === 'insumo'
                ? 'Excluir insumo?'
                : deleteTarget.kind === 'pedidoCompra'
                  ? 'Excluir pedido de compra?'
                  : deleteTarget.kind === 'inventario'
                    ? 'Excluir inventário?'
                    : 'Excluir imposto?'
          }
          message={
            deleteTarget.kind === 'fornecedor'
              ? `"${deleteTarget.item.nome}" será removido. Essa ação não pode ser desfeita.`
              : deleteTarget.kind === 'insumo'
                ? `"${deleteTarget.item.nome}" será removido, junto com qualquer vínculo em composições de produto ou misturas. Essa ação não pode ser desfeita.`
                : deleteTarget.kind === 'pedidoCompra'
                  ? deleteTarget.item.status === 'recebido'
                    ? 'Este pedido já foi recebido — excluir aqui NÃO desfaz a entrada no estoque, ela continua registrada nas movimentações. Essa ação não pode ser desfeita.'
                    : 'Este pedido será removido. Essa ação não pode ser desfeita.'
                  : deleteTarget.kind === 'inventario'
                    ? 'Excluir aqui NÃO desfaz os ajustes de estoque nem as perdas geradas por esta contagem — eles continuam registrados. Essa ação não pode ser desfeita.'
                    : `"${deleteTarget.item.nome}" será removido. Essa ação não pode ser desfeita.`
          }
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </main>
  )
}
