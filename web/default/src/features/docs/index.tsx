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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { useTranslation } from 'react-i18next'
import { PublicLayout } from '@/components/layout'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Heading = {
  level: 2 | 3
  title: string
  id: string
  children?: Heading[]
}

function slug(text: unknown): string {
  const raw = Array.isArray(text)
    ? text.map((v) => (typeof v === 'string' ? v : '')).join('')
    : String(text ?? '')
  return raw
    .toLowerCase()
    .replace(/[、，。,.!?:;！？：；""'`()（）【】\[\]<>《》]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function parseHeadings(md: string): Heading[] {
  const lines = md.split('\n')
  const top: Heading[] = []
  let cur: Heading | null = null
  let inFence = false
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m2 = line.match(/^##\s+(.+?)\s*$/)
    const m3 = line.match(/^###\s+(.+?)\s*$/)
    if (m2) {
      cur = { level: 2, title: m2[1], id: slug(m2[1]), children: [] }
      top.push(cur)
    } else if (m3 && cur) {
      cur.children!.push({ level: 3, title: m3[1], id: slug(m3[1]) })
    }
  }
  return top
}

async function fetchDocs(): Promise<string> {
  const res = await fetch('/README.md', { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Failed to load docs: ${res.status}`)
  return res.text()
}

function DocsSidebar({
  sections,
  activeId,
  onJump,
}: {
  sections: Heading[]
  activeId: string
  onJump: (id: string) => void
}) {
  return (
    <nav className='space-y-1 text-sm'>
      {sections.map((h2) => {
        const h2Active =
          activeId === h2.id ||
          h2.children?.some((c) => c.id === activeId)
        return (
          <div key={h2.id} className='space-y-0.5'>
            <button
              type='button'
              onClick={() => onJump(h2.id)}
              className={cn(
                'w-full rounded-md px-3 py-1.5 text-left font-medium transition-colors',
                h2Active
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground/80 hover:bg-muted hover:text-foreground'
              )}
            >
              {h2.title}
            </button>
            {h2.children && h2.children.length > 0 && (
              <div className='ml-3 space-y-0.5 border-l border-border/60'>
                {h2.children.map((h3) => (
                  <button
                    key={h3.id}
                    type='button'
                    onClick={() => onJump(h3.id)}
                    className={cn(
                      'block w-full rounded-md py-1 pr-2 pl-3 text-left transition-colors',
                      activeId === h3.id
                        ? 'border-l-2 border-primary -ml-[1px] pl-[11px] text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {h3.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

function DocsSkeleton() {
  return (
    <PublicLayout showMainContainer={false}>
      <div className='mx-auto flex w-full max-w-[1400px] gap-10 px-6 py-8 pt-20'>
        <div className='hidden w-60 shrink-0 space-y-3 lg:block'>
          <Skeleton className='h-6 w-[60%]' />
          <Skeleton className='h-4 w-[80%]' />
          <Skeleton className='h-4 w-[70%]' />
          <Skeleton className='h-4 w-[85%]' />
        </div>
        <div className='flex-1 space-y-4'>
          <Skeleton className='h-10 w-[40%]' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-[95%]' />
          <Skeleton className='h-4 w-[85%]' />
          <Skeleton className='h-32 w-full' />
        </div>
      </div>
    </PublicLayout>
  )
}

export function Docs() {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['local-docs'],
    queryFn: fetchDocs,
    staleTime: 5 * 60 * 1000,
  })

  const sections = useMemo(() => (data ? parseHeadings(data) : []), [data])
  const [activeId, setActiveId] = useState<string>('')
  const articleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!data || !articleRef.current) return
    const observed = articleRef.current.querySelectorAll('h2[id], h3[id]')
    const visible = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio)
          else visible.delete(e.target.id)
        }
        if (visible.size > 0) {
          const sorted = Array.from(visible.entries()).sort(
            (a, b) => b[1] - a[1]
          )
          setActiveId(sorted[0][0])
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: [0, 0.5, 1] }
    )
    observed.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [data])

  const handleJump = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 80
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  if (isLoading) return <DocsSkeleton />

  if (isError || !data) {
    return (
      <PublicLayout>
        <div className='mx-auto max-w-4xl px-4 py-12 text-center'>
          <p className='text-muted-foreground'>{t('Failed to load docs')}</p>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <div className='mx-auto flex w-full max-w-[1400px] gap-10 px-6 pb-16 pt-20'>
        <aside className='hidden w-60 shrink-0 lg:block'>
          <div className='sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2'>
            <div className='mb-3 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
              {t('Contents')}
            </div>
            <DocsSidebar
              sections={sections}
              activeId={activeId}
              onJump={handleJump}
            />
          </div>
        </aside>

        <article
          ref={articleRef}
          className={cn(
            'min-w-0 flex-1 max-w-3xl xl:max-w-4xl',
            'prose prose-neutral dark:prose-invert',
            'prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:tracking-tight',
            'prose-h1:mt-0 prose-h1:mb-8 prose-h1:text-4xl prose-h1:pb-4 prose-h1:border-b',
            'prose-h2:mt-12 prose-h2:mb-4 prose-h2:text-2xl prose-h2:border-l-4 prose-h2:border-primary prose-h2:pl-3',
            'prose-h3:mt-8 prose-h3:mb-3 prose-h3:text-lg',
            'prose-p:leading-relaxed',
            'prose-a:text-primary hover:prose-a:underline',
            'prose-code:bg-muted prose-code:text-foreground prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.88em] prose-code:before:content-none prose-code:after:content-none',
            'prose-pre:bg-muted prose-pre:border prose-pre:rounded-lg prose-pre:text-foreground prose-pre:shadow-sm',
            'prose-blockquote:border-l-primary prose-blockquote:bg-muted/40 prose-blockquote:py-1 prose-blockquote:font-normal prose-blockquote:not-italic',
            'prose-table:text-sm prose-th:bg-muted/60 prose-th:font-semibold prose-td:align-top',
            'prose-hr:my-10 prose-hr:border-border'
          )}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={{
              h2: ({ children, ...props }) => (
                <h2 id={slug(children)} {...props}>
                  {children}
                </h2>
              ),
              h3: ({ children, ...props }) => (
                <h3 id={slug(children)} {...props}>
                  {children}
                </h3>
              ),
              table: ({ children, ...props }) => (
                <div className='not-prose my-6 overflow-x-auto rounded-lg border'>
                  <table className='w-full text-sm' {...props}>
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children, ...props }) => (
                <thead className='bg-muted/60' {...props}>
                  {children}
                </thead>
              ),
              th: ({ children, ...props }) => (
                <th
                  className='border-b px-4 py-2 text-left font-semibold'
                  {...props}
                >
                  {children}
                </th>
              ),
              td: ({ children, ...props }) => (
                <td className='border-b border-border/40 px-4 py-2 align-top' {...props}>
                  {children}
                </td>
              ),
            }}
          >
            {data}
          </ReactMarkdown>
        </article>
      </div>
    </PublicLayout>
  )
}
