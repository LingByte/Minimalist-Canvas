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
import { Card, Col, Row, Skeleton } from 'antd'

import { VIEW_MODES, type ViewMode } from '../constants'

export interface LoadingSkeletonProps {
  viewMode?: ViewMode
}

export function LoadingSkeleton(props: LoadingSkeletonProps) {
  const viewMode = props.viewMode ?? VIEW_MODES.CARD

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Skeleton.Input active style={{ width: 160, marginBottom: 8 }} />
        <Skeleton.Input active size='small' style={{ width: 208 }} />
      </div>
      <Skeleton.Input active block style={{ height: 40 }} />
      <Skeleton.Input active block style={{ height: 48 }} />
      {viewMode === VIEW_MODES.TABLE ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <Row gutter={[16, 16]}>
          {Array.from({ length: 9 }).map((_, i) => (
            <Col key={i} xs={24} md={12} lg={8}>
              <Card
                style={{
                  background: 'var(--pricing-panel)',
                  borderColor: 'var(--pricing-border)',
                }}
              >
                <Skeleton avatar active paragraph={{ rows: 3 }} />
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}
