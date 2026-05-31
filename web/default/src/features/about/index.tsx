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
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Markdown } from '@/components/ui/markdown'
import { Skeleton } from '@/components/ui/skeleton'
import { PublicLayout } from '@/components/layout'
import { getAboutContent } from './api'

function isValidUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isLikelyHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function normalizeAboutContent(value: string) {
  const trimmed = value.trim()
  const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i)

  return (fenced?.[1] ?? trimmed).trim()
}

function translateAboutHtmlContent(
  value: string,
  translate: (key: string) => string
) {
  return value.replace(
    /(<[^>]*\sdata-i18n=(["'])(.*?)\2[^>]*>)([\s\S]*?)(<\/[^>]+>)/g,
    (_match, openTag: string, _quote: string, key: string, _content, closeTag: string) =>
      `${openTag}${translate(key)}${closeTag}`
  )
}

function ContactAboutState() {
  const { t } = useTranslation()

  return (
    <div className='flex min-h-[calc(100svh-8rem)] items-center justify-center px-4 py-10'>
      <section className='border-border/70 bg-card/60 w-full max-w-xl rounded-xl border px-6 py-8 text-center shadow-sm sm:px-10'>
        <div className='space-y-2'>
          <p className='text-muted-foreground text-sm font-medium'>
            {t('Customer Support')}
          </p>
          <h1 className='text-2xl font-semibold tracking-normal sm:text-3xl'>
            {t('Contact Us')}
          </h1>
          <p className='text-muted-foreground text-sm'>
            {t('Reach us through the following channels.')}
          </p>
        </div>

        <div className='mt-8 grid gap-3 text-left'>
          <div className='border-border/70 bg-background/70 flex items-center gap-3 rounded-lg border px-4 py-3'>
            <MessageCircle className='text-primary h-5 w-5 shrink-0' />
            <div>
              <div className='text-muted-foreground text-xs'>WhatsApp</div>
              <a
                href='https://wa.me/xxxx'
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary font-medium hover:underline'
              >
                xxxx
              </a>
            </div>
          </div>
          <div className='border-border/70 bg-background/70 flex items-center gap-3 rounded-lg border px-4 py-3'>
            <Send className='text-primary h-5 w-5 shrink-0' />
            <div>
              <div className='text-muted-foreground text-xs'>Telegram</div>
              <a
                href='https://t.me/XXX'
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary font-medium hover:underline'
              >
                XXX
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export function About() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['about-content'],
    queryFn: getAboutContent,
  })

  const rawContent = translateAboutHtmlContent(
    normalizeAboutContent(data?.data ?? ''),
    t
  )
  const hasContent = rawContent.length > 0
  const isUrl = hasContent && isValidUrl(rawContent)
  const isHtml = hasContent && !isUrl && isLikelyHtml(rawContent)

  if (isLoading) {
    return (
      <PublicLayout>
        <div className='mx-auto flex max-w-4xl flex-col gap-4 py-12'>
          <Skeleton className='h-8 w-[45%]' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-[90%]' />
          <Skeleton className='h-4 w-[80%]' />
        </div>
      </PublicLayout>
    )
  }

  if (!hasContent) {
    return (
      <PublicLayout>
        <ContactAboutState />
      </PublicLayout>
    )
  }

  if (isUrl) {
    return (
      <PublicLayout showMainContainer={false}>
        <iframe
          src={rawContent}
          className='h-[calc(100vh-3.5rem)] w-full border-0'
          title={t('About')}
        />
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className='mx-auto max-w-6xl px-4 py-8'>
        {isHtml ? (
          <div
            className='prose prose-neutral dark:prose-invert max-w-none'
            dangerouslySetInnerHTML={{ __html: rawContent }}
          />
        ) : (
          <Markdown className='prose-neutral dark:prose-invert max-w-none'>
            {rawContent}
          </Markdown>
        )}
      </div>
    </PublicLayout>
  )
}
