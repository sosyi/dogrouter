/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import React, { useEffect, useRef, useState } from 'react';
import { Banner, Button, Col, Form, Row, Spin } from '@douyinfe/semi-ui';
import {
  API,
  removeTrailingSlash,
  showError,
  showSuccess,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';

export default function SettingsPaymentGatewayBisheng(props) {
  const { t } = useTranslation();
  const sectionTitle = props.hideSectionTitle ? undefined : t('Bisheng USDT 设置');
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    BishengEnabled: false,
    BishengGateway: 'https://gateway.bishengusdt.com/api/coin/payOrder/create',
    BishengMerchant: '',
    BishengMd5Key: '',
    BishengMinTopUp: 1,
  });
  const formApiRef = useRef(null);

  useEffect(() => {
    if (props.options && formApiRef.current) {
      const currentInputs = {
        BishengEnabled: !!props.options.BishengEnabled,
        BishengGateway:
          props.options.BishengGateway ||
          'https://gateway.bishengusdt.com/api/coin/payOrder/create',
        BishengMerchant: props.options.BishengMerchant || '',
        BishengMd5Key: props.options.BishengMd5Key || '',
        BishengMinTopUp:
          props.options.BishengMinTopUp !== undefined
            ? parseFloat(props.options.BishengMinTopUp)
            : 1,
      };
      setInputs(currentInputs);
      formApiRef.current.setValues(currentInputs);
    }
  }, [props.options]);

  const submit = async () => {
    if (!inputs.BishengGateway || !inputs.BishengMerchant) {
      showError(t('请填写网关地址和商户 ID'));
      return;
    }

    setLoading(true);
    try {
      const options = [
        { key: 'BishengEnabled', value: inputs.BishengEnabled ? 'true' : 'false' },
        {
          key: 'BishengGateway',
          value: removeTrailingSlash(inputs.BishengGateway),
        },
        { key: 'BishengMerchant', value: inputs.BishengMerchant },
        { key: 'BishengMinTopUp', value: String(inputs.BishengMinTopUp || 1) },
      ];
      if (inputs.BishengMd5Key) {
        options.push({ key: 'BishengMd5Key', value: inputs.BishengMd5Key });
      }

      const results = await Promise.all(
        options.map((opt) => API.put('/api/option/', opt)),
      );
      const failed = results.filter((res) => !res.data.success);
      if (failed.length > 0) {
        failed.forEach((res) => showError(res.data.message));
      } else {
        showSuccess(t('更新成功'));
        props.refresh && props.refresh();
      }
    } catch (error) {
      showError(t('更新失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Spin spinning={loading}>
      <Form
        initValues={inputs}
        onValueChange={setInputs}
        getFormApi={(api) => (formApiRef.current = api)}
      >
        <Form.Section text={sectionTitle}>
          <Banner
            type='info'
            icon={<Info size={16} />}
            description={t(
              '接口模式：上游返回 USDT 地址，前台生成二维码并展示地址。回调地址为 /api/user/bisheng/notify，签名方式固定 MD5。',
            )}
            style={{ marginBottom: 16 }}
          />
          <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Switch field='BishengEnabled' label={t('启用 Bisheng USDT')} />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='BishengGateway'
                label={t('下单接口地址')}
                placeholder='https://gateway.bishengusdt.com/api/coin/payOrder/create'
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='BishengMerchant'
                label={t('商户 ID')}
                placeholder={t('例如：10070')}
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input
                field='BishengMd5Key'
                label={t('MD5 密钥')}
                placeholder={t('敏感信息不会发送到前端显示')}
                type='password'
              />
            </Col>
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.InputNumber
                field='BishengMinTopUp'
                label={t('最低充值美元数量')}
                min={1}
                precision={0}
              />
            </Col>
          </Row>
          <Button onClick={submit} style={{ marginTop: 16 }}>
            {t('更新 Bisheng USDT 设置')}
          </Button>
        </Form.Section>
      </Form>
    </Spin>
  );
}
