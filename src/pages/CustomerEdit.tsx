import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConfirm } from '../components/Confirm'
import { CustomerFields, emptyCustomer, type CustomerForm } from '../components/CustomerFields'
import { Button, Card, ErrorText, Page, TopBar } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { store } from '../lib/store'
import { keys, queryClient } from '../lib/queries'

export default function CustomerEdit() {
  const { id } = useParams()
  const { t, te } = useI18n()
  const nav = useNavigate()
  const [f, setF] = useState<CustomerForm>(emptyCustomer)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { ask, dialog } = useConfirm()

  useEffect(() => {
    if (!id) return
    store.getCustomer(id).then((c) => {
      if (!c) return
      const { id: _i, company_id: _c, customer_number: _n, created_at: _d, ...rest } = c
      void _i, void _c, void _n, void _d
      setF({ ...emptyCustomer, ...rest })
    })
  }, [id])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const c = await store.saveCustomer({ ...f, id })
      queryClient.invalidateQueries({ queryKey: keys.customers })
      nav(`/customers/${c.id}`, { replace: true })
    } catch (err) {
      setError(te(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!id || !(await ask(t('deleteCustomerConfirm'), t('delete')))) return
    await store.deleteCustomer(id)
    queryClient.invalidateQueries({ queryKey: keys.customers })
    nav('/customers', { replace: true })
  }

  return (
    <>
      <TopBar title={id ? t('editCustomer') : t('newCustomer')} back />
      <Page>
        <form onSubmit={submit} className="space-y-4">
          <Card>
            <CustomerFields value={f} onChange={setF} />
          </Card>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" block disabled={busy}>
            {t('save')}
          </Button>
          {id && (
            <Button type="button" variant="danger" block onClick={remove}>
              {t('deleteCustomer')}
            </Button>
          )}
        </form>
      </Page>
      {dialog}
    </>
  )
}
