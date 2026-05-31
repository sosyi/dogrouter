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

import React, { useEffect, useState } from 'react';
import { API, showError } from '../../helpers';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import { IconPhone, IconSend } from '@douyinfe/semi-icons';

const ContactAbout = ({ t }) => (
  <div className='flex min-h-[calc(100vh-80px)] items-center justify-center px-4 py-10'>
    <section className='w-full max-w-xl rounded-xl border border-semi-color-border bg-semi-color-bg-1 px-6 py-8 text-center shadow-sm sm:px-10'>
      <div className='space-y-2'>
        <p className='text-sm font-medium text-semi-color-text-2'>
          {t('Customer Support')}
        </p>
        <h1 className='text-2xl sm:text-3xl font-semibold'>
          {t('Contact Us')}
        </h1>
        <p className='text-sm text-semi-color-text-2'>
          {t('Reach us through the following channels.')}
        </p>
      </div>

      <div className='mt-8 grid gap-3 text-left'>
        <div className='flex items-center gap-3 rounded-lg border border-semi-color-border bg-semi-color-bg-0 px-4 py-3'>
          <IconPhone className='text-semi-color-primary' size='large' />
          <div>
            <div className='text-xs text-semi-color-text-2'>WhatsApp</div>
            <a
              href='https://wa.me/xxxx'
              target='_blank'
              rel='noopener noreferrer'
              className='!text-semi-color-primary font-medium'
            >
              xxxx
            </a>
          </div>
        </div>
        <div className='flex items-center gap-3 rounded-lg border border-semi-color-border bg-semi-color-bg-0 px-4 py-3'>
          <IconSend className='text-semi-color-primary' size='large' />
          <div>
            <div className='text-xs text-semi-color-text-2'>Telegram</div>
            <a
              href='https://t.me/XXX'
              target='_blank'
              rel='noopener noreferrer'
              className='!text-semi-color-primary font-medium'
            >
              XXX
            </a>
          </div>
        </div>
      </div>
    </section>
  </div>
);

const normalizeAboutContent = (value) => {
  const trimmed = String(value || '').trim();
  const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] || trimmed).trim();
};

const isLikelyHtml = (value) => /<\/?[a-z][\s\S]*>/i.test(value);

const translateAboutHtmlContent = (value, t) =>
  value.replace(
    /(<[^>]*\sdata-i18n=(["'])(.*?)\2[^>]*>)([\s\S]*?)(<\/[^>]+>)/g,
    (_match, openTag, _quote, key, _content, closeTag) =>
      `${openTag}${t(key)}${closeTag}`,
  );

const About = () => {
  const { t, i18n } = useTranslation();
  const [about, setAbout] = useState('');
  const [aboutLoaded, setAboutLoaded] = useState(false);

  const displayAbout = async () => {
    setAbout(localStorage.getItem('about') || '');
    const res = await API.get('/api/about');
    const { success, message, data } = res.data;
    if (success) {
      const normalizedData = translateAboutHtmlContent(
        normalizeAboutContent(data),
        t,
      );
      let aboutContent = normalizedData;
      if (
        !normalizedData.startsWith('https://') &&
        !isLikelyHtml(normalizedData)
      ) {
        aboutContent = marked.parse(normalizedData);
      }
      setAbout(aboutContent);
      localStorage.setItem('about', aboutContent);
    } else {
      showError(message);
      setAbout(t('加载关于内容失败...'));
    }
    setAboutLoaded(true);
  };

  useEffect(() => {
    displayAbout().then();
  }, [i18n.language]);

  return (
    <div className='mt-[60px] px-2'>
      {aboutLoaded && about === '' ? (
        <ContactAbout t={t} />
      ) : (
        <>
          {about.startsWith('https://') ? (
            <iframe
              src={about}
              style={{ width: '100%', height: '100vh', border: 'none' }}
            />
          ) : (
            <div
              style={{ fontSize: 'larger' }}
              dangerouslySetInnerHTML={{ __html: about }}
            ></div>
          )}
        </>
      )}
    </div>
  );
};

export default About;
