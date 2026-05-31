/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Clock3, Copy } from 'lucide-react'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { BishengPaymentData } from '../../types'

interface BishengPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payment: BishengPaymentData | null
}

function getBishengNetworkName(payment: BishengPaymentData): string {
  if (payment.coin_type.includes('BEP20')) return 'BEP20-USDT'
  if (payment.coin_type.includes('ERC20')) return 'ERC20-USDT'
  return 'TRC20-USDT'
}

function BishengNetworkLogo({
  network,
  className = 'h-5 w-5',
}: {
  network: string
  className?: string
}) {
  if (network === 'BEP20-USDT') {
    return (
      <span className={`${className} inline-flex items-center justify-center rounded-full bg-[#F0B90B] text-[10px] font-bold text-white`}>
        B
      </span>
    )
  }
  if (network === 'ERC20-USDT') {
    return (
      <svg className={className} viewBox='0 0 24 24' aria-hidden='true'>
        <path d='M12 2L5 12.2L12 16.3L19 12.2L12 2Z' fill='#627EEA' />
        <path d='M12 22L5 13.6L12 17.7L19 13.6L12 22Z' fill='#627EEA' />
      </svg>
    )
  }
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      aria-hidden='true'
    >
      <path d='M3 3.5L21 7.1L11.2 20.5L3 3.5Z' fill='#EF0027' />
      <path d='M5.2 5.6L10.8 17.2L12.4 9.4L5.2 5.6Z' fill='white' />
      <path d='M6.4 5.2L13 8.5L18.3 7.5L6.4 5.2Z' fill='white' />
      <path d='M13.5 9.5L12 16.4L18.1 8.3L13.5 9.5Z' fill='white' />
    </svg>
  )
}

export function BishengPaymentDialog({
  open,
  onOpenChange,
  payment,
}: BishengPaymentDialogProps) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard({
    successMessage: t('Copied to clipboard'),
  })
  const networkName = payment ? getBishengNetworkName(payment) : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('USDT Payment')}</DialogTitle>
          <DialogDescription>
            {payment
              ? t('Pay only with {{network}} for this order.', {
                  network: networkName,
                })
              : t('Confirm the payment network before sending assets.')}
          </DialogDescription>
        </DialogHeader>

        {payment && (
          <div className='flex flex-col gap-4'>
            <div className='rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-orange-800 dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-200'>
              <div className='flex items-center gap-2 text-sm font-semibold'>
                <BishengNetworkLogo network={networkName} />
                <Clock3 className='h-4 w-4' />
                <span>{t('Payment deadline')}</span>
              </div>
              <div className='mt-1 text-sm'>
                <span className='font-semibold text-red-600 dark:text-red-400'>
                  {t('Complete payment within 20 minutes.')}
                </span>
                {payment.client_expire_time ? (
                  <span className='ml-1'>
                    {t('Expires at')}: {payment.client_expire_time}
                  </span>
                ) : null}
              </div>
            </div>

            <div className='flex flex-col items-center gap-3'>
              <div className='rounded-lg border bg-white p-3'>
                <QRCodeSVG value={payment.address} size={220} />
              </div>
              <div className='w-full text-center'>
                <div className='text-muted-foreground text-sm'>
                  {t('Amount to pay:')}
                </div>
                <div className='text-2xl font-semibold'>
                  {payment.amount} USDT
                </div>
                <div className='text-muted-foreground mt-1 text-sm'>
                  {t('Network')}: {networkName}
                </div>
              </div>
            </div>

            <div className='w-full space-y-1.5'>
              <div className='text-muted-foreground text-sm'>
                {t('Payment Address')}
              </div>
              <div className='bg-muted/40 break-all rounded-lg border px-3 py-2 text-sm'>
                {payment.address}
              </div>
            </div>

            <div className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200'>
              <div className='flex items-center gap-2 font-semibold'>
                <AlertTriangle className='h-4 w-4' />
                <span>{t('Important Notice')}</span>
              </div>
              <ul className='mt-2 list-disc space-y-1 pl-5'>
                <li>
                  {t(
                    'Only send {{network}} assets. Other networks or assets will not be credited.',
                    { network: networkName }
                  )}
                </li>
                <li>
                  {t(
                    'Pay exactly to the amount and address shown for this order. Do not save or reuse this address.'
                  )}
                </li>
                <li>
                  {t(
                    'Funds arrive in 1-2 minutes after transfer. Exchanges and Web3 wallets are supported.'
                  )}
                </li>
              </ul>
            </div>

            <Button
              className='w-full gap-2'
              onClick={() => copyToClipboard(payment.address)}
            >
              <Copy className='h-4 w-4' />
              {t('Copy Address')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
