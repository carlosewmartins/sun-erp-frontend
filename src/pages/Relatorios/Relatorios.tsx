/**
 * src/pages/Relatorios/Relatorios.tsx
 *
 * Aba Relatórios — 4 sub-abas:
 *   1. Movimentações  → stock.move.line (state = done)
 *   2. Preços         → mail.tracking.value + mail.message + product.template
 *   3. Recibos        → stock.picking (picking_type_id = 2, origin sem 'NFC')
 *   4. NFC-e          → stock.picking (picking_type_id = 2, origin com 'NFC')
 *
 * ATENÇÃO — Recibos vs NFC-e:
 *   A distinção usa o campo `origin` do stock.picking.
 *   Constante NFCE_MARKER (linha ~60) deve bater com o prefixo que PDV.tsx grava.
 *   Exemplos comuns: 'NFC', 'NFCE', 'NFCe', chave fiscal parcial, etc.
 *
 * RPC helper local → independente de services/odoo.ts.
 * Usa o proxy /jsonrpc definido em vite.config.ts.
 */

import React, { useState, useCallback, useEffect } from 'react'
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Input,
  Pagination,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  ArrowRightOutlined,
  DollarOutlined,
  FileTextOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'

const { Text } = Typography
const { RangePicker } = DatePicker

// ─── Tokens de cor (idênticos aos demais componentes) ────────────────────────
const C = {
  amber:   '#F59E0B',
  amberBg: '#FFF8E7',
  success: '#22C55E',
  error:   '#EF4444',
  bgRow:   '#F8FAFC',
  border:  '#E2E8F0',
} as const

// ─── Marcador de NFC-e no campo origin do stock.picking ──────────────────────
// Ajuste para bater com o que PDV.tsx grava em origin ao emitir NFC-e.
const NFCE_MARKER = 'NFC'

// ─── Mapa de localizações (exibição) ─────────────────────────────────────────
const LOC: Record<number, string> = {
  4:  'Fornecedores',
  5:  'Clientes',
  8:  'WH/Estoque',
  17: 'Estoque Fiscal',
  18: 'Mezanino',
  19: 'Garagem',
  20: 'Depósito Lateral',
  21: 'Perdas e Quebras',
}

const LOC_OPTIONS = Object.entries(LOC).map(([id, name]) => ({
  value: Number(id),
  label: name,
}))

// ─── RPC helpers ─────────────────────────────────────────────────────────────
const DB = 'odoo_wms'
const UID = 2
const PWD = 'admin'

async function rpc<T>(
  model: string,
  method: string,
  args: unknown[],
  kw: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch('/jsonrpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: Date.now(),
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [DB, UID, PWD, model, method, args, kw],
      },
    }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.data?.message ?? json.error.message)
  return json.result as T
}

function sread<T>(
  model: string,
  domain: unknown[],
  fields: string[],
  opts: { limit?: number; offset?: number; order?: string } = {},
): Promise<T[]> {
  return rpc<T[]>(model, 'search_read', [domain, fields], {
    limit:  50,
    offset: 0,
    order:  'id desc',
    ...opts,
  })
}

function scount(model: string, domain: unknown[]): Promise<number> {
  return rpc<number>(model, 'search_count', [domain])
}

// ─── Types ───────────────────────────────────────────────────────────────────
type MoveLine = {
  id: number
  date: string
  product_id: [number, string]
  lot_id: false | [number, string]
  location_id: [number, string]
  location_dest_id: [number, string]
  qty_done: number
  reference: string
}

type PriceChange = {
  id: number
  date: string
  product_id: number
  product_name: string
  product_sku: string
  old_price: number
  new_price: number
  author: string
}

type Picking = {
  id: number
  name: string
  scheduled_date: string
  date_done: string | false
  origin: string | false
  note: string | false
  state: string
  move_line_ids: number[]
}

// ─── Utilitários ─────────────────────────────────────────────────────────────
const PAGE = 50

const fmtDate = (v: string | false) =>
  v ? dayjs(v).format('DD/MM/YYYY HH:mm') : '—'

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Constrói domain de OR para N condições em notação polonesa do Odoo
// ex: orDomain([A, B, C]) → ['|', A, '|', B, C]
function orDomain(conditions: unknown[]): unknown[] {
  if (conditions.length === 0) return []
  if (conditions.length === 1) return conditions
  const [first, ...rest] = conditions
  return ['|', first, ...orDomain(rest)]
}

// ─── Componente de filtros compartilhado ─────────────────────────────────────
type FiltrosProps = {
  periodo: [Dayjs, Dayjs] | null
  onPeriodo: (v: [Dayjs, Dayjs] | null) => void
  busca: string
  onBusca: (v: string) => void
  locais?: number[]
  onLocais?: (v: number[]) => void
  onSearch: () => void
  onClear: () => void
  extra?: React.ReactNode
}

function FiltrosCard({
  periodo, onPeriodo,
  busca, onBusca,
  locais, onLocais,
  onSearch, onClear,
  extra,
}: FiltrosProps) {
  return (
    <Card size="small" style={{ borderColor: C.border, background: C.amberBg }}>
      <Row gutter={[12, 8]} align="middle" wrap>
        <Col flex="280px">
          <RangePicker
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            placeholder={['Data inicial', 'Data final']}
            value={periodo}
            onChange={(v) => onPeriodo(v as [Dayjs, Dayjs] | null)}
            presets={[
              { label: 'Hoje',           value: [dayjs().startOf('day'), dayjs()] },
              { label: 'Esta semana',    value: [dayjs().startOf('week'), dayjs()] },
              { label: 'Este mês',       value: [dayjs().startOf('month'), dayjs()] },
              { label: 'Últimos 30 dias',value: [dayjs().subtract(30, 'day'), dayjs()] },
              { label: 'Últimos 90 dias',value: [dayjs().subtract(90, 'day'), dayjs()] },
            ]}
          />
        </Col>

        {onLocais && (
          <Col flex="220px">
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              placeholder="Filtrar localização"
              options={LOC_OPTIONS}
              value={locais}
              onChange={onLocais}
              maxTagCount="responsive"
            />
          </Col>
        )}

        <Col flex="auto" style={{ minWidth: 180 }}>
          <Input
            placeholder="Buscar produto, SKU, referência..."
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            onPressEnter={onSearch}
            allowClear
          />
        </Col>

        {extra}

        <Col>
          <Space>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              style={{ background: C.amber, borderColor: C.amber }}
              onClick={onSearch}
            >
              Buscar
            </Button>
            <Button icon={<ReloadOutlined />} onClick={onClear}>
              Limpar
            </Button>
          </Space>
        </Col>
      </Row>
    </Card>
  )
}

// ─── Rodapé de paginação compartilhado ───────────────────────────────────────
function Rodape({ total, page, onChange }: { total: number; page: number; onChange: (pg: number) => void }) {
  return (
    <Row justify="end">
      <Pagination
        current={page}
        total={total}
        pageSize={PAGE}
        showSizeChanger={false}
        showTotal={(t) => `Total: ${t} registro(s)`}
        onChange={onChange}
      />
    </Row>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1 — Movimentações de Estoque
// ═════════════════════════════════════════════════════════════════════════════
function TabMovimentacoes() {
  const { message } = App.useApp()

  const [loading,  setLoading]  = useState(false)
  const [data,     setData]     = useState<MoveLine[]>([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [busca,    setBusca]    = useState('')
  const [locais,   setLocais]   = useState<number[]>([])
  const [periodo,  setPeriodo]  = useState<[Dayjs, Dayjs] | null>(null)

  const buildDomain = useCallback(() => {
    const d: unknown[] = [['state', '=', 'done']]

    if (periodo) {
      d.push(['date', '>=', periodo[0].startOf('day').format('YYYY-MM-DD HH:mm:ss')])
      d.push(['date', '<=', periodo[1].endOf('day').format('YYYY-MM-DD HH:mm:ss')])
    }
    if (locais.length > 0) {
      // OR em notação polonesa para 2 condições
      d.push('|',
        ['location_id',      'in', locais],
        ['location_dest_id', 'in', locais],
      )
    }
    if (busca.trim()) {
      d.push(
        ...orDomain([
          ['product_id.name',        'ilike', busca],
          ['product_id.default_code','ilike', busca],
          ['reference',              'ilike', busca],
        ]),
      )
    }
    return d
  }, [periodo, locais, busca])

  const load = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const domain = buildDomain()
      const [rows, cnt] = await Promise.all([
        sread<MoveLine>(
          'stock.move.line',
          domain,
          ['id','date','product_id','lot_id','location_id','location_dest_id','qty_done','reference'],
          { offset: (pg - 1) * PAGE, limit: PAGE, order: 'date desc' },
        ),
        scount('stock.move.line', domain),
      ])
      setData(rows)
      setTotal(cnt)
      setPage(pg)
    } catch (e) {
      message.error('Erro ao carregar movimentações')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [buildDomain, message])

  // Carrega ao montar
  useEffect(() => { load(1) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const clear = () => { setBusca(''); setLocais([]); setPeriodo(null); load(1) }

  const locLabel = (loc: [number, string]) => LOC[loc[0]] ?? loc[1]

  const columns: ColumnsType<MoveLine> = [
    {
      title: 'Data / Hora',
      dataIndex: 'date',
      width: 155,
      render: (v) => <Text style={{ fontSize: 13 }}>{fmtDate(v)}</Text>,
    },
    {
      title: 'Produto',
      dataIndex: 'product_id',
      ellipsis: true,
      render: ([, name]: [number, string]) => (
        <Text strong style={{ fontSize: 13 }}>{name}</Text>
      ),
    },
    {
      title: 'Lote / Série',
      dataIndex: 'lot_id',
      width: 130,
      render: (v) =>
        v ? (
          <Tag style={{ fontSize: 12 }}>{v[1]}</Tag>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        ),
    },
    {
      title: 'Origem → Destino',
      key: 'rota',
      width: 300,
      render: (_, row) => (
        <Space size={4}>
          <Tag color="blue"  style={{ fontSize: 11, margin: 0 }}>{locLabel(row.location_id)}</Tag>
          <ArrowRightOutlined style={{ color: '#94A3B8', fontSize: 10 }} />
          <Tag color="green" style={{ fontSize: 11, margin: 0 }}>{locLabel(row.location_dest_id)}</Tag>
        </Space>
      ),
    },
    {
      title: 'Qtd',
      dataIndex: 'qty_done',
      width: 80,
      align: 'right',
      render: (v: number) => (
        <Text strong style={{ color: v > 0 ? C.success : C.error, fontSize: 14 }}>
          {v % 1 === 0 ? v.toString() : v.toFixed(3)}
        </Text>
      ),
    },
    {
      title: 'Referência',
      dataIndex: 'reference',
      width: 200,
      render: (v) => <Text code style={{ fontSize: 12 }}>{v || '—'}</Text>,
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <FiltrosCard
        periodo={periodo} onPeriodo={setPeriodo}
        busca={busca}    onBusca={setBusca}
        locais={locais}  onLocais={setLocais}
        onSearch={() => load(1)}
        onClear={clear}
      />

      <Text type="secondary" style={{ fontSize: 13 }}>
        {total} movimentação(ões) encontrada(s)
      </Text>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={data}
          columns={columns}
          pagination={false}
          locale={{ emptyText: <Empty description="Nenhuma movimentação encontrada" /> }}
        />
      </div>

      <Rodape total={total} page={page} onChange={load} />
    </Space>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2 — Histórico de Alterações de Preço
// Fonte: mail.tracking.value (field list_price no product.template)
// Fluxo: 3 RPC sequenciais → tracking_value → mail.message → product.template
// ═════════════════════════════════════════════════════════════════════════════
function TabPrecos() {
  const { message } = App.useApp()

  const [loading, setLoading] = useState(false)
  const [data,    setData]    = useState<PriceChange[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [busca,   setBusca]   = useState('')
  const [periodo, setPeriodo] = useState<[Dayjs, Dayjs] | null>(null)

  const buildDomain = useCallback(() => {
    const d: unknown[] = [
      ['field_id.name',          '=', 'list_price'],
      ['mail_message_id.model',  '=', 'product.template'],
    ]
    if (periodo) {
      d.push(['mail_message_id.date', '>=', periodo[0].startOf('day').format('YYYY-MM-DD HH:mm:ss')])
      d.push(['mail_message_id.date', '<=', periodo[1].endOf('day').format('YYYY-MM-DD HH:mm:ss')])
    }
    return d
  }, [periodo])

  const load = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      type RawTV   = { id: number; old_value_float: number; new_value_float: number; mail_message_id: [number, string] }
      type RawMsg  = { id: number; date: string; author_id: false | [number, string]; res_id: number }
      type RawProd = { id: number; name: string; default_code: false | string }

      const domain = buildDomain()
      const [tvRows, cnt] = await Promise.all([
        sread<RawTV>(
          'mail.tracking.value',
          domain,
          ['id','old_value_float','new_value_float','mail_message_id'],
          { offset: (pg - 1) * PAGE, limit: PAGE, order: 'id desc' },
        ),
        scount('mail.tracking.value', domain),
      ])

      if (!tvRows.length) {
        setData([]); setTotal(cnt); setPage(pg)
        return
      }

      // Busca mensagens relacionadas
      const msgIds = [...new Set(tvRows.map((r) => r.mail_message_id[0]))]
      const msgs = await sread<RawMsg>(
        'mail.message',
        [['id', 'in', msgIds]],
        ['id','date','author_id','res_id'],
        { limit: msgIds.length },
      )
      const msgMap = Object.fromEntries(msgs.map((m) => [m.id, m]))

      // Busca dados dos produtos
      const prodIds = [...new Set(msgs.map((m) => m.res_id).filter(Boolean))]
      const prods = prodIds.length
        ? await sread<RawProd>(
            'product.template',
            [['id', 'in', prodIds]],
            ['id','name','default_code'],
            { limit: prodIds.length },
          )
        : []
      const prodMap = Object.fromEntries(prods.map((p) => [p.id, p]))

      // Monta registros finais
      let rows: PriceChange[] = tvRows.map((tv) => {
        const msg  = msgMap[tv.mail_message_id[0]]
        const prod = msg ? prodMap[msg.res_id] : undefined
        return {
          id:           tv.id,
          date:         msg?.date ?? '',
          product_id:   msg?.res_id ?? 0,
          product_name: prod?.name ?? 'Produto removido',
          product_sku:  prod?.default_code || '—',
          old_price:    tv.old_value_float ?? 0,
          new_price:    tv.new_value_float ?? 0,
          author:       msg?.author_id ? msg.author_id[1] : 'Sistema',
        }
      })

      // Filtro de busca client-side (busca já foi feita no domínio por período;
      // a filtragem por nome de produto requer o join — fazemos aqui após o merge)
      if (busca.trim()) {
        const q = busca.toLowerCase()
        rows = rows.filter(
          (r) =>
            r.product_name.toLowerCase().includes(q) ||
            r.product_sku.toLowerCase().includes(q),
        )
      }

      setData(rows)
      setTotal(cnt)
      setPage(pg)
    } catch (e) {
      message.error('Erro ao carregar histórico de preços')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [buildDomain, busca, message])

  useEffect(() => { load(1) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const clear = () => { setBusca(''); setPeriodo(null); load(1) }

  const columns: ColumnsType<PriceChange> = [
    {
      title: 'Data / Hora',
      dataIndex: 'date',
      width: 155,
      render: (v) => <Text style={{ fontSize: 13 }}>{fmtDate(v)}</Text>,
    },
    {
      title: 'Produto',
      key: 'produto',
      ellipsis: true,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>{r.product_name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>SKU: {r.product_sku}</Text>
        </Space>
      ),
    },
    {
      title: 'Preço Anterior',
      dataIndex: 'old_price',
      width: 150,
      align: 'right',
      render: (v: number) => (
        <Text style={{ fontSize: 13, textDecoration: 'line-through', color: '#94A3B8' }}>
          {fmtBRL(v)}
        </Text>
      ),
    },
    {
      title: 'Preço Novo',
      dataIndex: 'new_price',
      width: 150,
      align: 'right',
      render: (v: number) => (
        <Text strong style={{ fontSize: 13 }}>{fmtBRL(v)}</Text>
      ),
    },
    {
      title: 'Variação',
      key: 'variacao',
      width: 110,
      align: 'center',
      render: (_, r) => {
        const diff = r.new_price - r.old_price
        const pct  = r.old_price > 0 ? (diff / r.old_price) * 100 : 0
        return (
          <Tag
            color={diff >= 0 ? 'green' : 'red'}
            style={{ fontSize: 12, fontWeight: 600, minWidth: 68, textAlign: 'center' }}
          >
            {diff >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
          </Tag>
        )
      },
    },
    {
      title: 'Usuário',
      dataIndex: 'author',
      width: 180,
      render: (v) => <Text style={{ fontSize: 13 }}>{v}</Text>,
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <FiltrosCard
        periodo={periodo} onPeriodo={setPeriodo}
        busca={busca}    onBusca={setBusca}
        onSearch={() => load(1)}
        onClear={clear}
      />

      <Text type="secondary" style={{ fontSize: 13 }}>
        {total} alteração(ões) de preço encontrada(s)
      </Text>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={data}
          columns={columns}
          pagination={false}
          locale={{ emptyText: <Empty description="Nenhuma alteração de preço encontrada" /> }}
        />
      </div>

      <Rodape total={total} page={page} onChange={load} />
    </Space>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TABS 3 & 4 — Recibos / NFC-e
// Componente compartilhado, diferenciado pela prop `tipo`.
// Ambos consultam stock.picking (picking_type_id = 2, state = done).
// Distinção: `origin` contém NFCE_MARKER → NFC-e; caso contrário → Recibo.
// ═════════════════════════════════════════════════════════════════════════════
type TabPickingsProps = { tipo: 'recibo' | 'nfce' }

function TabPickings({ tipo }: TabPickingsProps) {
  const { message } = App.useApp()

  const [loading, setLoading] = useState(false)
  const [data,    setData]    = useState<Picking[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [busca,   setBusca]   = useState('')
  const [periodo, setPeriodo] = useState<[Dayjs, Dayjs] | null>(null)

  const buildDomain = useCallback(() => {
    const d: unknown[] = [
      ['picking_type_id', '=', 2],   // ID 2 = Pedidos de entrega (saída PDV)
      ['state',           '=', 'done'],
    ]

    // Filtro fiscal vs recibo
    if (tipo === 'nfce') {
      d.push(['origin', 'ilike', NFCE_MARKER])
    } else {
      d.push(['origin', 'not ilike', NFCE_MARKER])
    }

    if (periodo) {
      d.push(['date_done', '>=', periodo[0].startOf('day').format('YYYY-MM-DD HH:mm:ss')])
      d.push(['date_done', '<=', periodo[1].endOf('day').format('YYYY-MM-DD HH:mm:ss')])
    }
    if (busca.trim()) {
      d.push('|', ['name', 'ilike', busca], ['origin', 'ilike', busca])
    }
    return d
  }, [tipo, periodo, busca])

  const load = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const domain = buildDomain()
      const [rows, cnt] = await Promise.all([
        sread<Picking>(
          'stock.picking',
          domain,
          ['id','name','scheduled_date','date_done','origin','note','state','move_line_ids'],
          { offset: (pg - 1) * PAGE, limit: PAGE, order: 'date_done desc' },
        ),
        scount('stock.picking', domain),
      ])
      setData(rows)
      setTotal(cnt)
      setPage(pg)
    } catch (e) {
      message.error(`Erro ao carregar ${tipo === 'nfce' ? 'NFC-e' : 'recibos'}`)
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [buildDomain, tipo, message])

  // Recarrega sempre que o tipo muda (troca de aba)
  useEffect(() => { load(1) }, [tipo]) // eslint-disable-line react-hooks/exhaustive-deps

  const clear = () => { setBusca(''); setPeriodo(null); load(1) }

  const estadoTag = (s: string) => {
    const map: Record<string, { color: string; label: string }> = {
      done:      { color: 'green',   label: 'Concluído'  },
      cancel:    { color: 'red',     label: 'Cancelado'  },
      waiting:   { color: 'orange',  label: 'Aguardando' },
      confirmed: { color: 'blue',    label: 'Confirmado' },
      assigned:  { color: 'cyan',    label: 'Pronto'     },
    }
    const t = map[s] ?? { color: 'default', label: s }
    return <Tag color={t.color} style={{ fontSize: 12 }}>{t.label}</Tag>
  }

  const colsBase: ColumnsType<Picking> = [
    {
      title: 'Data / Hora',
      key: 'data',
      width: 155,
      render: (_, r) => (
        <Text style={{ fontSize: 13 }}>{fmtDate(r.date_done || r.scheduled_date)}</Text>
      ),
    },
    {
      title: 'Referência',
      dataIndex: 'name',
      width: 160,
      render: (v) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Origem',
      dataIndex: 'origin',
      width: 200,
      render: (v) => (
        <Text style={{ fontSize: 13 }}>{v || <Text type="secondary">—</Text>}</Text>
      ),
    },
    {
      title: 'Observação',
      dataIndex: 'note',
      ellipsis: true,
      render: (v) =>
        v ? (
          <Text style={{ fontSize: 12 }}>{v}</Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        ),
    },
    {
      title: 'Itens',
      dataIndex: 'move_line_ids',
      width: 70,
      align: 'center',
      render: (v: number[]) => (
        <Tag style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{v.length}</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'state',
      width: 120,
      render: estadoTag,
    },
  ]

  // Coluna extra para NFC-e: botão de reimpressão (stub — aguarda implementação)
  const colsNfce: ColumnsType<Picking> = [
    ...colsBase,
    {
      title: 'Ações',
      key: 'acoes',
      width: 110,
      align: 'center',
      render: () => (
        <Tooltip title="Reimpressão disponível em breve">
          <Button
            size="small"
            icon={<PrinterOutlined />}
            disabled
            style={{ fontSize: 12 }}
          >
            Imprimir
          </Button>
        </Tooltip>
      ),
    },
  ]

  const emptyMsg = tipo === 'nfce' ? 'Nenhuma NFC-e encontrada' : 'Nenhum recibo encontrado'

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <FiltrosCard
        periodo={periodo} onPeriodo={setPeriodo}
        busca={busca}    onBusca={setBusca}
        onSearch={() => load(1)}
        onClear={clear}
      />

      <Text type="secondary" style={{ fontSize: 13 }}>
        {total} {tipo === 'nfce' ? 'NFC-e' : 'recibo(s)'} encontrado(s)
      </Text>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={data}
          columns={tipo === 'nfce' ? colsNfce : colsBase}
          pagination={false}
          locale={{ emptyText: <Empty description={emptyMsg} /> }}
        />
      </div>

      <Rodape total={total} page={page} onChange={load} />
    </Space>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL — Relatórios
// ═════════════════════════════════════════════════════════════════════════════
export default function Relatorios() {
  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      {/* Cabeçalho */}
      <div>
        <Text style={{ fontSize: 22, fontWeight: 700, color: '#1A1A1A', display: 'block' }}>
          Relatórios
        </Text>
        <Text type="secondary">Histórico de operações do sistema</Text>
      </div>

      {/* Abas */}
      <Tabs
        type="card"
        size="large"
        destroyInactiveTabPane={false}
        items={[
          {
            key: 'movimentacoes',
            label: (
              <Space>
                <SwapOutlined />
                Movimentações
              </Space>
            ),
            children: <TabMovimentacoes />,
          },
          {
            key: 'precos',
            label: (
              <Space>
                <DollarOutlined />
                Preços
              </Space>
            ),
            children: <TabPrecos />,
          },
          {
            key: 'recibos',
            label: (
              <Space>
                <FileTextOutlined />
                Recibos
              </Space>
            ),
            children: <TabPickings tipo="recibo" />,
          },
          {
            key: 'nfce',
            label: (
              <Space>
                <PrinterOutlined />
                NFC-e
              </Space>
            ),
            children: <TabPickings tipo="nfce" />,
          },
        ]}
      />
    </Space>
  )
}