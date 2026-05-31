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
import { useState, useCallback } from 'react'
import i18next from 'i18next'
import { toast } from 'sonner'
import {
  calculateAmount,
  calculateBishengAmount,
  calculateStripeAmount,
  calculateWaffoPancakeAmount,
  requestPayment,
  requestBishengPayment,
  requestStripePayment,
  isApiSuccess,
} from '../api'
import {
  isStripePayment,
  isWaffoPancakePayment,
  isBishengPayment,
  submitPaymentForm,
} from '../lib'
import type { BishengPaymentData } from '../types'

// ============================================================================
// Payment Hook
// ============================================================================

function formatBishengLocalExpireTime() {
  const expireAt = new Date(Date.now() + 20 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${expireAt.getFullYear()}-${pad(expireAt.getMonth() + 1)}-${pad(expireAt.getDate())} ${pad(expireAt.getHours())}:${pad(expireAt.getMinutes())}:${pad(expireAt.getSeconds())}`
}

export function usePayment() {
  const [amount, setAmount] = useState<number>(0)
  const [calculating, setCalculating] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [bishengPayment, setBishengPayment] =
    useState<BishengPaymentData | null>(null)

  // Calculate payment amount
  const calculatePaymentAmount = useCallback(
    async (topupAmount: number, paymentType: string) => {
      try {
        setCalculating(true)

        const isStripe = isStripePayment(paymentType)
        const isPancake = isWaffoPancakePayment(paymentType)
        const isBisheng = isBishengPayment(paymentType)
        const response = isStripe
          ? await calculateStripeAmount({ amount: topupAmount })
          : isPancake
            ? await calculateWaffoPancakeAmount({ amount: topupAmount })
            : isBisheng
              ? await calculateBishengAmount({ amount: topupAmount })
              : await calculateAmount({ amount: topupAmount })

        if (isApiSuccess(response) && response.data) {
          const calculatedAmount = parseFloat(response.data)
          setAmount(calculatedAmount)
          return calculatedAmount
        }

        // Don't show error for calculation, just set to 0
        setAmount(0)
        return 0
      } catch (_error) {
        setAmount(0)
        return 0
      } finally {
        setCalculating(false)
      }
    },
    []
  )

  // Process payment
  const processPayment = useCallback(
    async (topupAmount: number, paymentType: string) => {
      try {
        setProcessing(true)

        const isStripe = isStripePayment(paymentType)
        const isBisheng = isBishengPayment(paymentType)
        const amount = Math.floor(topupAmount)

        const response = isStripe
          ? await requestStripePayment({
              amount,
              payment_method: paymentType,
            })
          : isBisheng
            ? await requestBishengPayment({
                amount,
                payment_method: paymentType,
              })
          : await requestPayment({
              amount,
              payment_method: paymentType,
            })

        if (!isApiSuccess(response)) {
          toast.error(response.message || i18next.t('Payment request failed'))
          return false
        }

        // Handle Stripe payment
        if (
          isStripe &&
          response.data &&
          typeof response.data === 'object' &&
          'pay_link' in response.data
        ) {
          window.open(String(response.data.pay_link), '_blank')
          toast.success(i18next.t('Redirecting to payment page...'))
          return true
        }

        if (isBisheng && response.data && typeof response.data === 'object') {
          setBishengPayment({
            ...(response.data as BishengPaymentData),
            client_expire_time: formatBishengLocalExpireTime(),
          })
          return true
        }

        // Handle non-Stripe payment
        if (
          !isStripe &&
          !isBisheng &&
          response.data &&
          typeof response.data === 'object'
        ) {
          const url = (response as unknown as { url?: string }).url
          if (url) {
            submitPaymentForm(url, response.data as Record<string, unknown>)
            toast.success(i18next.t('Redirecting to payment page...'))
            return true
          }
        }

        return false
      } catch (_error) {
        toast.error(i18next.t('Payment request failed'))
        return false
      } finally {
        setProcessing(false)
      }
    },
    []
  )

  return {
    amount,
    bishengPayment,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
    setBishengPayment,
    setAmount,
  }
}
