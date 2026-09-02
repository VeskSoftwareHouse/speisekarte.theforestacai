import { useMemo, useState } from 'react'
import { Coins, Sparkles, UtensilsCrossed, Users } from 'lucide-react'
import type { Category, MenuItem, Modifier, ModifierOption, TipOption } from '@shared/types'
import { useMenuAdmin, DeleteBlockedError } from '../hooks/useMenuAdmin'
import { useUserAdmin, type AdminUser } from '../hooks/useUserAdmin'
import { useModifierAdmin } from '../hooks/useModifierAdmin'
import { useTipAdmin } from '../hooks/useTipAdmin'
import CategoryPanel from './CategoryPanel'
import ProductPanel from './ProductPanel'
import CategoryFormModal from './CategoryFormModal'
import ProductFormModal from './ProductFormModal'
import UsersPanel from './UsersPanel'
import UserFormModal from './UserFormModal'
import ModifierGroupPanel from './ModifierGroupPanel'
import ModifierOptionPanel from './ModifierOptionPanel'
import ModifierGroupFormModal from './ModifierGroupFormModal'
import ModifierOptionFormModal from './ModifierOptionFormModal'
import TipPanel from './TipPanel'
import TipFormModal from './TipFormModal'
import ConfirmDialog from './ConfirmDialog'
import DeleteBlockedDialog from './DeleteBlockedDialog'

type DeleteTarget =
  | { kind: 'category'; item: Category }
  | { kind: 'product'; item: MenuItem }
  | { kind: 'user'; item: AdminUser }
  | { kind: 'modifierGroup'; item: Modifier }
  | { kind: 'modifierOption'; item: ModifierOption }
  | { kind: 'tip'; item: TipOption }

type Tab = 'cardapio' | 'adicionais' | 'gorjetas' | 'usuarios'

interface Props {
  accessToken: string
  currentUserId: string
}

export default function MenuManager({ accessToken, currentUserId }: Props) {
  const {
    categories,
    items,
    loading,
    error,
    createCategory,
    updateCategory,
    deleteCategory,
    createProduct,
    updateProduct,
    deleteProduct,
    uploadImage,
  } = useMenuAdmin()

  const {
    users,
    loading: usersLoading,
    error: usersError,
    createUser,
    updateUser,
    deleteUser,
  } = useUserAdmin(accessToken)

  const {
    groups,
    options,
    linksByItem,
    loading: modifiersLoading,
    error: modifiersError,
    createGroup,
    updateGroup,
    deleteGroup,
    createOption,
    updateOption,
    deleteOption,
    setProductModifiers,
  } = useModifierAdmin()

  const {
    tips,
    loading: tipsLoading,
    error: tipsError,
    createTip,
    updateTip,
    deleteTip,
    toggleTip,
  } = useTipAdmin()

  const [tab, setTab] = useState<Tab>('cardapio')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [categoryForm, setCategoryForm] = useState<'new' | Category | null>(null)
  const [productForm, setProductForm] = useState<'new' | MenuItem | null>(null)
  const [userForm, setUserForm] = useState<'new' | AdminUser | null>(null)
  const [modifierGroupForm, setModifierGroupForm] = useState<'new' | Modifier | null>(null)
  const [modifierOptionForm, setModifierOptionForm] = useState<'new' | ModifierOption | null>(null)
  const [tipForm, setTipForm] = useState<'new' | TipOption | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleteBlocked, setDeleteBlocked] = useState<Extract<
    DeleteTarget,
    { kind: 'product' | 'category' }
  > | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const categoriesById = useMemo(() => {
    const map: Record<string, Category> = {}
    for (const c of categories) map[c.id] = c
    return map
  }, [categories])

  const itemCountByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of items) map[p.categoria_id] = (map[p.categoria_id] ?? 0) + 1
    return map
  }, [items])

  const visibleProducts = selectedCategoryId ? items.filter((p) => p.categoria_id === selectedCategoryId) : items

  const groupsById = useMemo(() => {
    const map: Record<string, Modifier> = {}
    for (const g of groups) map[g.id] = g
    return map
  }, [groups])

  const optionCountByGroup = useMemo(() => {
    const map: Record<string, number> = {}
    for (const o of options) map[o.modifier_id] = (map[o.modifier_id] ?? 0) + 1
    return map
  }, [options])

  const visibleOptions = selectedGroupId ? options.filter((o) => o.modifier_id === selectedGroupId) : options

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return
    setActionError(null)
    try {
      if (deleteTarget.kind === 'category') {
        await deleteCategory(deleteTarget.item.id)
        if (selectedCategoryId === deleteTarget.item.id) setSelectedCategoryId(null)
      } else if (deleteTarget.kind === 'product') {
        await deleteProduct(deleteTarget.item.id)
      } else if (deleteTarget.kind === 'user') {
        await deleteUser(deleteTarget.item.id)
      } else if (deleteTarget.kind === 'tip') {
        await deleteTip(deleteTarget.item.id)
      } else if (deleteTarget.kind === 'modifierGroup') {
        await deleteGroup(deleteTarget.item.id)
        if (selectedGroupId === deleteTarget.item.id) setSelectedGroupId(null)
      } else {
        await deleteOption(deleteTarget.item.id)
      }
      setDeleteTarget(null)
    } catch (err) {
      if (err instanceof DeleteBlockedError && (deleteTarget.kind === 'product' || deleteTarget.kind === 'category')) {
        setDeleteBlocked(deleteTarget)
      } else {
        setActionError(err instanceof Error ? err.message : 'Não foi possível excluir.')
      }
      setDeleteTarget(null)
    }
  }

  async function handleToggleAvailable(product: MenuItem) {
    setActionError(null)
    try {
      await updateProduct(product.id, {
        categoria_id: product.categoria_id,
        nome: product.nome,
        nome_i18n: product.nome_i18n,
        descricao: product.descricao ?? '',
        descricao_i18n: product.descricao_i18n,
        preco: product.preco,
        foto_url: product.foto_url,
        disponivel: !product.disponivel,
        destaque: product.destaque,
        descricao_na_comanda: product.descricao_na_comanda,
        ordem: product.ordem,
      })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível atualizar.')
    }
  }

  return (
    <main className="menu-manager">
      <div className="menu-manager__tabs">
        <button
          className={`menu-manager__tab ${tab === 'cardapio' ? 'menu-manager__tab--active' : ''}`}
          onClick={() => setTab('cardapio')}
        >
          <UtensilsCrossed size={16} strokeWidth={2} aria-hidden />
          Cardápio
        </button>
        <button
          className={`menu-manager__tab ${tab === 'adicionais' ? 'menu-manager__tab--active' : ''}`}
          onClick={() => setTab('adicionais')}
        >
          <Sparkles size={16} strokeWidth={2} aria-hidden />
          Adicionais
        </button>
        <button
          className={`menu-manager__tab ${tab === 'gorjetas' ? 'menu-manager__tab--active' : ''}`}
          onClick={() => setTab('gorjetas')}
        >
          <Coins size={16} strokeWidth={2} aria-hidden />
          Gorjetas
        </button>
        <button
          className={`menu-manager__tab ${tab === 'usuarios' ? 'menu-manager__tab--active' : ''}`}
          onClick={() => setTab('usuarios')}
        >
          <Users size={16} strokeWidth={2} aria-hidden />
          Usuários
        </button>
      </div>

      {tab === 'cardapio' && error && <p className="equipe-app__error">Erro ao carregar cardápio: {error}</p>}
      {tab === 'usuarios' && usersError && <p className="equipe-app__error">Erro ao carregar usuários: {usersError}</p>}
      {tab === 'adicionais' && modifiersError && (
        <p className="equipe-app__error">Erro ao carregar adicionais: {modifiersError}</p>
      )}
      {tab === 'gorjetas' && tipsError && <p className="equipe-app__error">Erro ao carregar gorjetas: {tipsError}</p>}
      {actionError && (
        <p className="equipe-app__error" role="alert">
          {actionError}
        </p>
      )}

      {tab === 'cardapio' && loading && <p className="equipe-app__status">Carregando cardápio…</p>}
      {tab === 'cardapio' && !loading && (
        <div className="menu-manager__grid">
          <CategoryPanel
            categories={categories}
            itemCountByCategory={itemCountByCategory}
            selectedId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
            onAdd={() => setCategoryForm('new')}
            onEdit={(c) => setCategoryForm(c)}
            onDelete={(c) => setDeleteTarget({ kind: 'category', item: c })}
          />
          <ProductPanel
            products={visibleProducts}
            categoriesById={categoriesById}
            onAdd={() => setProductForm('new')}
            onEdit={(p) => setProductForm(p)}
            onDelete={(p) => setDeleteTarget({ kind: 'product', item: p })}
            onToggleAvailable={handleToggleAvailable}
          />
        </div>
      )}

      {tab === 'adicionais' && modifiersLoading && <p className="equipe-app__status">Carregando adicionais…</p>}
      {tab === 'adicionais' && !modifiersLoading && (
        <div className="menu-manager__grid">
          <ModifierGroupPanel
            groups={groups}
            optionCountByGroup={optionCountByGroup}
            selectedId={selectedGroupId}
            onSelect={setSelectedGroupId}
            onAdd={() => setModifierGroupForm('new')}
            onEdit={(g) => setModifierGroupForm(g)}
            onDelete={(g) => setDeleteTarget({ kind: 'modifierGroup', item: g })}
          />
          <ModifierOptionPanel
            options={visibleOptions}
            groupsById={groupsById}
            onAdd={() => setModifierOptionForm('new')}
            onEdit={(o) => setModifierOptionForm(o)}
            onDelete={(o) => setDeleteTarget({ kind: 'modifierOption', item: o })}
          />
        </div>
      )}

      {tab === 'gorjetas' && tipsLoading && <p className="equipe-app__status">Carregando gorjetas…</p>}
      {tab === 'gorjetas' && !tipsLoading && (
        <div className="menu-manager__single">
          <TipPanel
            tips={tips}
            onAdd={() => setTipForm('new')}
            onEdit={(tip) => setTipForm(tip)}
            onDelete={(tip) => setDeleteTarget({ kind: 'tip', item: tip })}
            onToggle={async (tip, ativo) => {
              setActionError(null)
              try {
                await toggleTip(tip.id, ativo)
              } catch (err) {
                setActionError(err instanceof Error ? err.message : 'Não foi possível atualizar.')
              }
            }}
          />
        </div>
      )}

      {tab === 'usuarios' && usersLoading && <p className="equipe-app__status">Carregando usuários…</p>}
      {tab === 'usuarios' && !usersLoading && (
        <UsersPanel
          users={users}
          currentUserId={currentUserId}
          onAdd={() => setUserForm('new')}
          onEdit={(u) => setUserForm(u)}
          onDelete={(u) => setDeleteTarget({ kind: 'user', item: u })}
        />
      )}

      {categoryForm && (
        <CategoryFormModal
          category={categoryForm === 'new' ? null : categoryForm}
          accessToken={accessToken}
          onClose={() => setCategoryForm(null)}
          onSave={async (input) => {
            if (categoryForm === 'new') await createCategory(input)
            else await updateCategory(categoryForm.id, input)
          }}
        />
      )}

      {productForm && (
        <ProductFormModal
          product={productForm === 'new' ? null : productForm}
          categories={categories}
          defaultCategoryId={selectedCategoryId}
          modifierGroups={groups}
          linkedModifierIds={productForm === 'new' ? [] : (linksByItem[productForm.id] ?? [])}
          accessToken={accessToken}
          onClose={() => setProductForm(null)}
          onSave={async (input, modifierIds) => {
            const id = productForm === 'new' ? (await createProduct(input)).id : productForm.id
            if (productForm !== 'new') await updateProduct(productForm.id, input)
            await setProductModifiers(id, modifierIds)
          }}
          onUploadImage={uploadImage}
        />
      )}

      {tipForm && (
        <TipFormModal
          tip={tipForm === 'new' ? null : tipForm}
          proximaOrdem={tips.length ? Math.max(...tips.map((t) => t.ordem)) + 1 : 1}
          onClose={() => setTipForm(null)}
          onSave={async (input) => {
            if (tipForm === 'new') await createTip(input)
            else await updateTip(tipForm.id, input)
          }}
        />
      )}

      {userForm && (
        <UserFormModal
          user={userForm === 'new' ? null : userForm}
          onClose={() => setUserForm(null)}
          onSave={async (input) => {
            if (userForm === 'new') await createUser(input)
            else await updateUser(userForm.id, input)
          }}
        />
      )}

      {modifierGroupForm && (
        <ModifierGroupFormModal
          group={modifierGroupForm === 'new' ? null : modifierGroupForm}
          accessToken={accessToken}
          onClose={() => setModifierGroupForm(null)}
          onSave={async (input) => {
            if (modifierGroupForm === 'new') await createGroup(input)
            else await updateGroup(modifierGroupForm.id, input)
          }}
        />
      )}

      {modifierOptionForm && (
        <ModifierOptionFormModal
          option={modifierOptionForm === 'new' ? null : modifierOptionForm}
          groups={groups}
          defaultGroupId={selectedGroupId}
          accessToken={accessToken}
          onClose={() => setModifierOptionForm(null)}
          onSave={async (input) => {
            if (modifierOptionForm === 'new') await createOption(input)
            else await updateOption(modifierOptionForm.id, input)
          }}
          onUploadImage={uploadImage}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={
            deleteTarget.kind === 'category'
              ? 'Excluir categoria?'
              : deleteTarget.kind === 'product'
                ? 'Excluir produto?'
                : deleteTarget.kind === 'user'
                  ? 'Excluir usuário?'
                  : deleteTarget.kind === 'modifierGroup'
                    ? 'Excluir categoria de adicionais?'
                    : deleteTarget.kind === 'tip'
                      ? 'Excluir opção de gorjeta?'
                      : 'Excluir adicional?'
          }
          message={
            deleteTarget.kind === 'category'
              ? `Isso também vai excluir os ${itemCountByCategory[deleteTarget.item.id] ?? 0} produto(s) dessa categoria. Essa ação não pode ser desfeita.`
              : deleteTarget.kind === 'product'
                ? `"${deleteTarget.item.nome}" será removido do cardápio. Essa ação não pode ser desfeita.`
                : deleteTarget.kind === 'user'
                  ? `"${deleteTarget.item.nome || deleteTarget.item.email}" perderá o acesso ao painel. Essa ação não pode ser desfeita.`
                  : deleteTarget.kind === 'modifierGroup'
                    ? `Isso também vai excluir os ${optionCountByGroup[deleteTarget.item.id] ?? 0} adicional(is) dessa categoria e desassociá-la dos produtos. Essa ação não pode ser desfeita.`
                    : deleteTarget.kind === 'tip'
                      ? 'Essa opção deixa de aparecer no totem. Os pedidos que já usaram ela não mudam. Se for só por um tempo, dá para desligar em vez de excluir.'
                      : `"${deleteTarget.item.nome}" será removido. Essa ação não pode ser desfeita.`
          }
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {deleteBlocked && (
        <DeleteBlockedDialog
          title="Não é possível excluir"
          message={
            deleteBlocked.kind === 'product'
              ? `"${deleteBlocked.item.nome}" já foi pedido antes, então não pode ser apagado — isso quebraria o histórico de pedidos. Você pode desativá-lo em vez disso: ele some do cardápio da mesa, mas o histórico continua intacto.`
              : `Um ou mais produtos de "${deleteBlocked.item.nome}" já foram pedidos antes, então a categoria não pode ser apagada — isso quebraria o histórico de pedidos. Desative os produtos dessa categoria individualmente em vez de excluir a categoria.`
          }
          actionLabel={
            deleteBlocked.kind === 'product' && deleteBlocked.item.disponivel ? 'Desativar produto' : undefined
          }
          onAction={
            deleteBlocked.kind === 'product' && deleteBlocked.item.disponivel
              ? async () => {
                  await handleToggleAvailable(deleteBlocked.item as MenuItem)
                  setDeleteBlocked(null)
                }
              : undefined
          }
          onClose={() => setDeleteBlocked(null)}
        />
      )}
    </main>
  )
}
