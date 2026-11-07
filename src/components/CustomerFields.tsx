import { useI18n } from '../lib/i18n'
import type { Customer, CustomerType } from '../lib/types'
import { Field, Input, Segmented, Textarea } from './ui'

export type CustomerForm = Omit<Customer, 'id' | 'company_id' | 'customer_number' | 'created_at'>

export const emptyCustomer: CustomerForm = {
  type: 'private',
  company_name: '',
  name: '',
  street: '',
  zip: '',
  city: '',
  email: '',
  phone: '',
  vat_id: '',
  reference: '',
  notes: '',
}

export function CustomerFields({ value: f, onChange, compact }: { value: CustomerForm; onChange: (f: CustomerForm) => void; compact?: boolean }) {
  const { t } = useI18n()
  const txt = (k: keyof CustomerForm) => ({
    value: String(f[k] ?? ''),
    onChange: (e: { target: { value: string } }) => onChange({ ...f, [k]: e.target.value }),
  })
  return (
    <div className="space-y-4">
      <Segmented<CustomerType>
        value={f.type}
        onChange={(type) => onChange({ ...f, type })}
        options={[
          { value: 'private', label: t('privateCustomer') },
          { value: 'business', label: t('businessCustomer') },
        ]}
      />
      {f.type === 'business' && (
        <Field label={t('customerCompany') + ' *'}>
          <Input required {...txt('company_name')} autoComplete="organization" />
        </Field>
      )}
      <Field label={(f.type === 'business' ? t('contactName') : t('customerName')) + (f.type === 'private' ? ' *' : '')}>
        <Input required={f.type === 'private'} {...txt('name')} autoComplete="name" />
      </Field>
      <Field label={t('street')}>
        <Input {...txt('street')} autoComplete="street-address" />
      </Field>
      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <Field label={t('zip')}>
          <Input inputMode="numeric" {...txt('zip')} autoComplete="postal-code" />
        </Field>
        <Field label={t('city')}>
          <Input {...txt('city')} autoComplete="address-level2" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('email')}>
          <Input type="email" {...txt('email')} autoComplete="email" />
        </Field>
        <Field label={t('phone')}>
          <Input type="tel" {...txt('phone')} autoComplete="tel" />
        </Field>
      </div>
      {!compact && f.type === 'business' && (
        <>
          <Field label={t('vatId')}>
            <Input {...txt('vat_id')} />
          </Field>
          <Field label={t('customerReference')}>
            <Input {...txt('reference')} />
          </Field>
        </>
      )}
      {!compact && (
        <Field label={t('notes')}>
          <Textarea {...txt('notes')} />
        </Field>
      )}
    </div>
  )
}
