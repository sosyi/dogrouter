/*
Copyright (C) 2025 QuantumNous

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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { Layout, Nav, Spin, Empty, Tabs, TabPane } from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import './docs.css';

const { Sider, Content } = Layout;

const TABS = [
  { key: 'api', labelKey: 'API 文档', file: '/api-docs.md' },
  { key: 'agents', labelKey: '接入 Agent 工具', file: '/agent-tools.md' },
];

function slug(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[、，。,.!?:;！？：；""''`()（）【】\[\]<>《》]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function parseHeadings(md) {
  const lines = md.split('\n');
  const top = [];
  let cur = null;
  let inFence = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m2 = line.match(/^##\s+(.+?)\s*$/);
    const m3 = line.match(/^###\s+(.+?)\s*$/);
    if (m2) {
      cur = { title: m2[1], id: slug(m2[1]), children: [] };
      top.push(cur);
    } else if (m3 && cur) {
      cur.children.push({ title: m3[1], id: slug(m3[1]) });
    }
  }
  return top;
}

const Docs = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('api');
  const [cache, setCache] = useState({}); // { api: {md, html}, agents: {...} }
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [activeId, setActiveId] = useState('');
  const articleRef = useRef(null);

  const currentTab = useMemo(
    () => TABS.find((tab) => tab.key === activeTab) || TABS[0],
    [activeTab],
  );

  const currentData = cache[activeTab];
  const html = currentData?.html || '';
  const md = currentData?.md || '';

  const sections = useMemo(() => (md ? parseHeadings(md) : []), [md]);

  // 初次挂载：并行拉两份文档并缓存
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pairs = await Promise.all(
          TABS.map(async (tab) => {
            const res = await fetch(tab.file, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`${tab.file}: HTTP ${res.status}`);
            const text = await res.text();
            const rendered = marked.parse(text, { gfm: true, breaks: false });
            return [tab.key, { md: text, html: rendered }];
          }),
        );
        if (!cancelled) {
          const next = {};
          for (const [k, v] of pairs) next[k] = v;
          setCache(next);
        }
      } catch (e) {
        if (!cancelled) setErrored(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 切换 tab 或内容变化时：重写 h1-h4 的 id，建立滚动高亮监听
  useEffect(() => {
    if (!html || !articleRef.current) return;
    const headings = articleRef.current.querySelectorAll('h1, h2, h3, h4');
    headings.forEach((el) => {
      const text = (el.textContent || '').trim();
      if (text) el.id = slug(text);
    });

    // 切 tab 时滚回顶部（在 Semi Content 的 overflow 容器里）
    const scroller = articleRef.current.closest('.docs-content');
    if (scroller) scroller.scrollTop = 0;
    setActiveId('');

    const targets = articleRef.current.querySelectorAll('h2[id], h3[id]');
    const visible = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio);
          else visible.delete(e.target.id);
        }
        if (visible.size > 0) {
          const sorted = Array.from(visible.entries()).sort(
            (a, b) => b[1] - a[1],
          );
          setActiveId(sorted[0][0]);
        }
      },
      { rootMargin: '-64px 0px -60% 0px', threshold: [0, 0.5, 1] },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [html]);

  const handleJump = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const navItems = useMemo(
    () =>
      sections.map((h2) => ({
        itemKey: h2.id,
        text: h2.title,
        items:
          h2.children && h2.children.length > 0
            ? h2.children.map((h3) => ({ itemKey: h3.id, text: h3.title }))
            : undefined,
      })),
    [sections],
  );

  const openKeys = useMemo(() => sections.map((s) => s.id), [sections]);

  if (loading) {
    return (
      <div className='docs-loading'>
        <Spin size='large' />
      </div>
    );
  }

  if (errored) {
    return (
      <div className='docs-loading'>
        <Empty
          image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
          darkModeImage={
            <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
          }
          description={t('加载文档失败')}
          style={{ padding: 30 }}
        />
      </div>
    );
  }

  return (
    <Layout className='docs-layout'>
      {!isMobile && (
        <Sider className='docs-sidebar docs-scroll-hide'>
          <div className='docs-sidebar-header'>
            <div className='docs-sidebar-title'>
              {t(currentTab.labelKey)}
            </div>
            <div className='docs-sidebar-subtitle'>
              {t(
                activeTab === 'api'
                  ? '按端点分类的接口参考'
                  : '主流客户端接入指引',
              )}
            </div>
          </div>
          <Nav
            className='docs-nav'
            mode='vertical'
            items={navItems}
            selectedKeys={[activeId]}
            defaultOpenKeys={openKeys}
            key={activeTab}
            onSelect={(data) => {
              if (data && typeof data.itemKey === 'string') {
                handleJump(data.itemKey);
              }
            }}
            style={{ maxWidth: '100%', border: 'none' }}
          />
        </Sider>
      )}

      <Content className='docs-content docs-scroll-hide'>
        <div className='docs-tabs-bar'>
          <Tabs
            type='line'
            size='large'
            activeKey={activeTab}
            onChange={setActiveTab}
          >
            {TABS.map((tab) => (
              <TabPane tab={t(tab.labelKey)} itemKey={tab.key} key={tab.key} />
            ))}
          </Tabs>
        </div>

        <article
          ref={articleRef}
          className='docs-article'
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </Content>
    </Layout>
  );
};

export default Docs;
