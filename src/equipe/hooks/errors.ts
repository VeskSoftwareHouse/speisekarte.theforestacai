/** Lançado ao tentar excluir um registro que já é referenciado por outra
 * tabela (viola foreign key) — ex: fornecedor com pedidos de compra,
 * produto/categoria com pedidos. */
export class DeleteBlockedError extends Error {
  constructor(message = 'Não é possível excluir: já existe um registro que referencia este item.') {
    super(message)
    this.name = 'DeleteBlockedError'
  }
}
