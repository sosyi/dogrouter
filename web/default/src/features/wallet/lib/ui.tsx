/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { type ReactNode } from 'react'
import { CreditCard, Landmark } from 'lucide-react'
import {
  SiAlipay,
  SiBinance,
  SiEthereum,
  SiStripe,
  SiWechat,
} from 'react-icons/si'
import { PAYMENT_TYPES, PAYMENT_ICON_COLORS } from '../constants'

// ============================================================================
// UI Helper Functions
// ============================================================================

const HAS_LOCATION =
  typeof globalThis !== 'undefined' && 'location' in globalThis

function TronIcon({ className }: { className?: string }): ReactNode {
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

/**
 * Resolves a backend-provided image URL to http(s) only. Rejects javascript:,
 * data:, blob:, file:, and URLs with userinfo, which are unsafe in <img src/>.
 */
function normalizeHttpIconUrl(raw: string | undefined | null): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  let url: URL
  try {
    url = HAS_LOCATION
      ? new URL(s, (globalThis as { location: Location }).location.href)
      : new URL(s)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null
  }
  if (url.username || url.password) {
    return null
  }
  return url.toString()
}

/**
 * Get payment method icon component
 *
 * When iconUrl is provided, render an <img/> with that URL so custom
 * gateway logos can be configured per-method.
 */
export function getPaymentIcon(
  paymentType: string | undefined,
  className: string = 'h-4 w-4',
  iconUrl?: string,
  altName?: string
): ReactNode {
  const safeIconUrl = normalizeHttpIconUrl(iconUrl)
  if (safeIconUrl) {
    return (
      <img
        src={safeIconUrl}
        alt={altName || paymentType || 'payment'}
        className={className}
        style={{ objectFit: 'contain' }}
        loading='lazy'
        decoding='async'
        referrerPolicy='no-referrer'
      />
    )
  }

  if (!paymentType) {
    return <CreditCard className={className} />
  }

  switch (paymentType) {
    case PAYMENT_TYPES.ALIPAY:
      return (
        <SiAlipay
          className={className}
          style={{ color: PAYMENT_ICON_COLORS[PAYMENT_TYPES.ALIPAY] }}
        />
      )
    case PAYMENT_TYPES.WECHAT:
      return (
        <SiWechat
          className={className}
          style={{ color: PAYMENT_ICON_COLORS[PAYMENT_TYPES.WECHAT] }}
        />
      )
    case PAYMENT_TYPES.STRIPE:
      return (
        <SiStripe
          className={className}
          style={{ color: PAYMENT_ICON_COLORS[PAYMENT_TYPES.STRIPE] }}
        />
      )
    case PAYMENT_TYPES.STRIPE_ALIPAY:
      return (
        <SiAlipay
          className={className}
          style={{ color: PAYMENT_ICON_COLORS[PAYMENT_TYPES.STRIPE_ALIPAY] }}
        />
      )
    case PAYMENT_TYPES.STRIPE_WECHAT:
      return (
        <SiWechat
          className={className}
          style={{ color: PAYMENT_ICON_COLORS[PAYMENT_TYPES.STRIPE_WECHAT] }}
        />
      )
    case PAYMENT_TYPES.STRIPE_CARD:
      return (
        <CreditCard
          className={className}
          style={{ color: PAYMENT_ICON_COLORS[PAYMENT_TYPES.STRIPE_CARD] }}
        />
      )
    case 'bisheng_trc20_usdt':
      return <TronIcon className={className} />
    case 'bisheng_bep20_usdt':
      return <SiBinance className={className} style={{ color: '#F0B90B' }} />
    case 'bisheng_erc20_usdt':
      return <SiEthereum className={className} style={{ color: '#627EEA' }} />
    case PAYMENT_TYPES.CREEM:
      return (
        <Landmark
          className={className}
          style={{ color: PAYMENT_ICON_COLORS[PAYMENT_TYPES.CREEM] }}
        />
      )
    case PAYMENT_TYPES.WAFFO:
      return (
        <CreditCard
          className={className}
          style={{ color: PAYMENT_ICON_COLORS[PAYMENT_TYPES.WAFFO] }}
        />
      )
    case PAYMENT_TYPES.WAFFO_PANCAKE:
      return (
        <CreditCard
          className={className}
          style={{ color: PAYMENT_ICON_COLORS[PAYMENT_TYPES.WAFFO_PANCAKE] }}
        />
      )
    default:
      return <CreditCard className={className} />
  }
}
