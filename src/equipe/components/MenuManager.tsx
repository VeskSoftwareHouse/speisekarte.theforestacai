import { useMemo, useState } from 'react'
import { UtensilsCrossed, Users } from 'lucide-react'
import type { Category, MenuItem } from '@shared/types'
import { useMenuAdmin } from '../hooks/useMenuAdmin'
import { useUserAdmin, type AdminUser } from '../hooks/useUserAdmin'
import CategoryPanel from './CategoryPanel'
import ProductPanel from './ProductPanel'
import CategoryFormModal from './CategoryFormModal'
import ProductFormModal from './ProductFormModal'
import UsersPanel from './UsersPanel'
import UserFormModal from './UserFormModal'
import ConfirmDialog from './ConfirmDialog'

type DeleteTarget =
  | { kind: 'category'; item: Category }
  | { kind: 'product'; item: MenuItem }
  | { kind: 'user'; item: AdminUser }

type Tab = 'cardapio' | 'usuarios'

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
    uploadProductImage,
  } = useMenuAdmin()

  const {
    users,
    loading: usersLoading,
    error: usersError,
    createUser,
    updateUser,
    deleteUser,
  } = useUserAdmin(accessToken)

  const [tab, setTab] = useState<Tab>('cardapio')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [categoryForm, setCategoryForm] = useState<'new' | Category | null>(null)
  const [productForm, setProductForm] = useState<'new' | MenuItem | null>(null)
  const [userForm, setUserForm] = useState<'new' | AdminUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
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

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return
    setActionError(null)
    try {
      if (deleteTarget.kind === 'category') {
        await deleteCategory(deleteTarget.item.id)
        if (selectedCategoryId === deleteTarget.item.id) setSelectedCategoryId(null)
      } else if (deleteTarget.kind === 'product') {
        await deleteProduct(deleteTarget.item.id)
      } else {
        await deleteUser(deleteTarget.item.id)
      }
      setDeleteTarget(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível excluir.')
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
          className={`menu-manager__tab ${tab === 'usuarios' ? 'menu-manager__tab--active' : ''}`}
          onClick={() => setTab('usuarios')}
        >
          <Users size={16} strokeWidth={2} aria-hidden />
          Usuários
        </button>
      </div>

      {tab === 'cardapio' && error && <p className="equipe-app__error">Erro ao carregar cardápio: {error}</p>}
      {tab === 'usuarios' && usersError && <p className="equipe-app__error">Erro ao carregar usuários: {usersError}</p>}
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
          onClose={() => setProductForm(null)}
          onSave={async (input) => {
            if (productForm === 'new') await createProduct(input)
            else await updateProduct(productForm.id, input)
          }}
          onUploadImage={uploadProductImage}
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

      {deleteTarget && (
        <ConfirmDialog
          title={
            deleteTarget.kind === 'category'
              ? 'Excluir categoria?'
              : deleteTarget.kind === 'product'
                ? 'Excluir produto?'
                : 'Excluir usuário?'
          }
          message={
            deleteTarget.kind === 'category'
              ? `Isso também vai excluir os ${itemCountByCategory[deleteTarget.item.id] ?? 0} produto(s) dessa categoria. Essa ação não pode ser desfeita.`
              : deleteTarget.kind === 'product'
                ? `"${deleteTarget.item.nome}" será removido do cardápio. Essa ação não pode ser desfeita.`
                : `"${deleteTarget.item.nome || deleteTarget.item.email}" perderá o acesso ao painel. Essa ação não pode ser desfeita.`
          }
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </main>
  )
}
